CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,course TEXT NOT NULL,title TEXT NOT NULL,prompt TEXT NOT NULL,published INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,assignment TEXT NOT NULL,user TEXT NOT NULL,body TEXT NOT NULL,created REAL NOT NULL,request_key TEXT NOT NULL,UNIQUE(user,assignment,request_key));
CREATE TABLE IF NOT EXISTS grade_versions(submission TEXT NOT NULL,version INTEGER NOT NULL,score REAL NOT NULL CHECK(score>=0 AND score<=100),feedback TEXT NOT NULL,posted INTEGER NOT NULL,grader TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(submission,version));
CREATE TABLE IF NOT EXISTS grade_publications(submission TEXT PRIMARY KEY,version INTEGER);
CREATE TRIGGER IF NOT EXISTS submission_no_update BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT,'Submission history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS submission_no_delete BEFORE DELETE ON submissions BEGIN SELECT RAISE(ABORT,'Submission history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS grades_no_update BEFORE UPDATE ON grade_versions BEGIN SELECT RAISE(ABORT,'Grade versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS grades_no_delete BEFORE DELETE ON grade_versions BEGIN SELECT RAISE(ABORT,'Grade versions are immutable'); END;
