CREATE TABLE IF NOT EXISTS enrollments(user TEXT,course TEXT,role TEXT,status TEXT,PRIMARY KEY(user,course));
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,course TEXT,title TEXT,anchor TEXT,body TEXT,state TEXT,release_at REAL,unlocked INTEGER,roles TEXT);
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,course TEXT,body TEXT,state TEXT,version INTEGER,creator TEXT);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS outbox_no_update BEFORE UPDATE ON outbox BEGIN SELECT RAISE(ABORT,'Append-only event'); END;
CREATE TRIGGER IF NOT EXISTS outbox_no_delete BEFORE DELETE ON outbox BEGIN SELECT RAISE(ABORT,'Append-only event'); END;
