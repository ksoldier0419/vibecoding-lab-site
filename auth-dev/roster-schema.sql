CREATE TABLE IF NOT EXISTS login_dev_courses (id VARCHAR(80) PRIMARY KEY, title VARCHAR(150) NOT NULL);
CREATE TABLE IF NOT EXISTS login_dev_roster (
 id BIGSERIAL PRIMARY KEY, student_number VARCHAR(20) NOT NULL UNIQUE, student_name VARCHAR(100) NOT NULL,
 google_id TEXT UNIQUE REFERENCES login_dev_users(google_id), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS login_dev_enrollments (
 roster_id BIGINT NOT NULL REFERENCES login_dev_roster(id), course_id VARCHAR(80) NOT NULL REFERENCES login_dev_courses(id),
 section VARCHAR(30) NOT NULL DEFAULT '', PRIMARY KEY (roster_id, course_id, section)
);
