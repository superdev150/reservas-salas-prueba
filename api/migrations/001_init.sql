CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  capacity   INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  location   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id           SERIAL PRIMARY KEY,
  room_id      INTEGER NOT NULL REFERENCES rooms(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_valid_range CHECK (ends_at > starts_at),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'active')
);

CREATE INDEX bookings_starts_at_idx ON bookings (starts_at);
CREATE INDEX bookings_user_idx ON bookings (user_id, starts_at);
