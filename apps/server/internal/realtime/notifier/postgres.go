package notifier

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"

	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5/pgxpool"
)

var identifierRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

type HandlerFunc func(ctx context.Context, event events.Envelope) error

type Notifier interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type PostgresNotifier struct {
	pool    *pgxpool.Pool
	channel string
}

func NewPostgresNotifier(pool *pgxpool.Pool, channel string) (*PostgresNotifier, error) {
	if !identifierRegex.MatchString(channel) {
		return nil, fmt.Errorf("invalid notify channel %q", channel)
	}
	return &PostgresNotifier{pool: pool, channel: channel}, nil
}

func (n *PostgresNotifier) Channel() string {
	return n.channel
}

func (n *PostgresNotifier) Publish(ctx context.Context, event events.Envelope) error {
	encoded, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal realtime event: %w", err)
	}

	_, err = n.pool.Exec(ctx, `SELECT pg_notify($1, $2)`, n.channel, string(encoded))
	if err != nil {
		return fmt.Errorf("publish notify event: %w", err)
	}
	return nil
}

func (n *PostgresNotifier) Subscribe(ctx context.Context, handler HandlerFunc) error {
	conn, err := n.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire listen connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN "+n.channel); err != nil {
		return fmt.Errorf("listen channel: %w", err)
	}

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("wait for notification: %w", err)
		}

		var event events.Envelope
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			log.Printf("realtime subscriber: invalid payload: %v", err)
			continue
		}

		if err := handler(ctx, event); err != nil {
			log.Printf("realtime subscriber handler failed: %v", err)
		}
	}
}

type Subscriber struct {
	notifier *PostgresNotifier
	handler  HandlerFunc
}

func NewSubscriber(notifier *PostgresNotifier, handler HandlerFunc) *Subscriber {
	return &Subscriber{notifier: notifier, handler: handler}
}

func (s *Subscriber) Run(ctx context.Context) error {
	return s.notifier.Subscribe(ctx, s.handler)
}
