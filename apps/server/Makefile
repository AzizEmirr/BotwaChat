DB_URL ?= postgres://postgres:postgres@localhost:5432/catwa?sslmode=disable
MIGRATIONS_PATH ?= ./migrations
MIGRATE ?= migrate

.PHONY: migrate-up migrate-down migrate-force migrate-create run test

migrate-up:
	$(MIGRATE) -path $(MIGRATIONS_PATH) -database "$(DB_URL)" up

migrate-down:
	$(MIGRATE) -path $(MIGRATIONS_PATH) -database "$(DB_URL)" down 1

migrate-force:
	$(MIGRATE) -path $(MIGRATIONS_PATH) -database "$(DB_URL)" force $(VERSION)

migrate-create:
	$(MIGRATE) create -ext sql -dir $(MIGRATIONS_PATH) -seq $(NAME)

run:
	go run ./cmd/server

test:
	go test ./...
