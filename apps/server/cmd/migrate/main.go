package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/config"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	command, forceVersion, err := parseArgs(os.Args[1:])
	if err != nil {
		log.Fatalf("%v", err)
	}

	sourceURL, err := migrationSourceURL()
	if err != nil {
		log.Fatalf("build migration source path: %v", err)
	}

	m, err := migrate.New(sourceURL, cfg.PostgresURL)
	if err != nil {
		log.Fatalf("initialize migrator: %v", err)
	}
	defer func() {
		sourceErr, dbErr := m.Close()
		if sourceErr != nil {
			log.Printf("close source: %v", sourceErr)
		}
		if dbErr != nil {
			log.Printf("close db: %v", dbErr)
		}
	}()

	switch command {
	case "up":
		if err := m.Up(); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Println("migrations already up to date")
				return
			}
			log.Fatalf("migrate up failed: %v", err)
		}
		log.Println("migrate up completed")
	case "down":
		if err := m.Steps(-1); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Println("no migration to roll back")
				return
			}
			log.Fatalf("migrate down failed: %v", err)
		}
		log.Println("migrate down completed")
	case "force":
		if err := m.Force(forceVersion); err != nil {
			log.Fatalf("migrate force failed: %v", err)
		}
		log.Printf("migration version forced to %d", forceVersion)
	default:
		log.Fatalf("unknown command %q", command)
	}
}

func parseArgs(args []string) (string, int, error) {
	if len(args) == 0 {
		return "", 0, fmt.Errorf("usage: go run ./cmd/migrate <up|down|force> [version]")
	}

	command := strings.ToLower(strings.TrimSpace(args[0]))
	switch command {
	case "up", "down":
		return command, 0, nil
	case "force":
		if len(args) > 1 {
			version, err := strconv.Atoi(strings.TrimSpace(args[1]))
			if err != nil {
				return "", 0, fmt.Errorf("invalid force version %q", args[1])
			}
			return command, version, nil
		}

		envVersion := strings.TrimSpace(os.Getenv("MIGRATE_FORCE_VERSION"))
		if envVersion == "" {
			return "", 0, fmt.Errorf("force requires version argument or MIGRATE_FORCE_VERSION env")
		}
		version, err := strconv.Atoi(envVersion)
		if err != nil {
			return "", 0, fmt.Errorf("invalid MIGRATE_FORCE_VERSION %q", envVersion)
		}
		return command, version, nil
	default:
		return "", 0, fmt.Errorf("usage: go run ./cmd/migrate <up|down|force> [version]")
	}
}

func migrationSourceURL() (string, error) {
	migrationsPath := strings.TrimSpace(os.Getenv("MIGRATIONS_PATH"))
	if migrationsPath == "" {
		migrationsPath = "./migrations"
	}

	absPath, err := filepath.Abs(migrationsPath)
	if err != nil {
		return "", err
	}

	return "file://" + filepath.ToSlash(absPath), nil
}
