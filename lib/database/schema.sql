--
-- DROPS
--
DROP TRIGGER IF EXISTS v_feasibility_insert ON v_feasibility;
DROP FUNCTION IF EXISTS get_project_id(TEXT);
DROP FUNCTION IF EXISTS get_user_id(TEXT);
DROP FUNCTION IF EXISTS add_feasibility();

DROP VIEW IF EXISTS v_feasibility;
DROP TABLE IF EXISTS feasibility;
DROP TABLE IF EXISTS project;
DROP TABLE IF EXISTS jira_user;


--
-- TABLE CREATION
--

-- Note: 'id' for the 'jira-user' and 'project' tables are not necessary as, in this context, 'name' and 'username' are natural 
-- primary keys. I chose to add the serial ID to both tables in order to reap the storage benefits (i.e. storing a serial number in the 
-- 'feasibility' table as foriegn keys is cheaper than storing potentially long 'name' and 'username' as foreign keys)
CREATE TABLE project (
  id SERIAL UNIQUE,
  name TEXT,
  CONSTRAINT project_pk PRIMARY KEY (id, name)
);

CREATE TABLE jira_user (
  id SERIAL UNIQUE,
  username TEXT,
  CONSTRAINT user_pk PRIMARY KEY (id, username)
);

CREATE TABLE feasibility (
  key TEXT NOT NULL,
  summary TEXT NOT NULL,
  created TIMESTAMP WITH TIME ZONE NOT NULL,
  resolution_date TIMESTAMP WITH TIME ZONE,
  design_estimate REAL,
  development_estimate REAL NOT NULL,
  development_pad_estimate REAL,
  pe_estimate REAL,
  pm_estimate REAL,
  qa_estimate REAL,
  issue_links JSON,
  worklog JSON,
  feasibility_timespent REAL,
  issue_links_timespent REAL,
  feasibility_estimate_total REAL,
  delta_percentage REAL,
  delta REAL,
  fk_reviewer INTEGER NOT NULL,
  fk_reporter INTEGER NOT NULL,
  fk_project INTEGER NOT NULL,
  CONSTRAINT feas_pk PRIMARY KEY (key),
  CONSTRAINT reporter_fk FOREIGN KEY (fk_reporter) REFERENCES jira_user (id),
  CONSTRAINT reviewer_fk FOREIGN KEY (fk_reviewer) REFERENCES jira_user (id),
  CONSTRAINT project_fk FOREIGN KEY (fk_project) REFERENCES project (id)
);


--
-- VIEW CREATION
--

CREATE OR REPLACE VIEW v_feasibility AS (
  -- for each feasibility key, give me the human readable reviewer name
  WITH cte_reviewer AS (
    SELECT key, jira_user.username as reviewer_name
    FROM feasibility
    LEFT JOIN jira_user 
      ON (feasibility.fk_reviewer = jira_user.id)),

  -- for each feasibility key, give me the human readable reporter name
  cte_reporter AS (
    SELECT key, jira_user.username as reporter_name
    FROM feasibility
    LEFT JOIN jira_user 
      ON (feasibility.fk_reporter = jira_user.id)),

  -- for each feasibility key, give me the human readable project name
  cte_project AS (
    SELECT key, project.name as project_name
    FROM feasibility
    LEFT JOIN project ON (fk_project = project.id))

  SELECT feasibility.key, feasibility.summary, feasibility.created, feasibility.resolution_date, feasibility.design_estimate, 
         feasibility.development_estimate, feasibility.development_pad_estimate, feasibility.pe_estimate, feasibility.pm_estimate,
         feasibility.qa_estimate, feasibility.issue_links, feasibility.worklog, feasibility.feasibility_timespent, feasibility.issue_links_timespent,
         feasibility.feasibility_estimate_total, reviewer_name, reporter_name, project_name, feasibility.delta_percentage, feasibility.delta
  FROM feasibility
  LEFT JOIN cte_reviewer ON (feasibility.key = cte_reviewer.key)
  LEFT JOIN cte_reporter ON (feasibility.key = cte_reporter.key)
  LEFT JOIN cte_project ON (feasibility.key = cte_project.key));

--
-- FUNCTIONS
--

--
-- Function: get_project_id
-- Parameters: _project_name (TEXT)
-- Usage: Returns the ID of _project_name. If _project_name does not exist, _project_name is added to the project table and the new ID is returned.
--
CREATE OR REPLACE FUNCTION get_project_id(_project_name TEXT) RETURNS INTEGER AS $$
DECLARE
  project_id INTEGER;
BEGIN
  SELECT id INTO project_id FROM project WHERE name = _project_name;
  IF project_id is NULL THEN
    INSERT INTO project (name) VALUES (_project_name);
    SELECT id INTO project_id FROM project WHERE name = _project_name;
  END IF;
  RETURN project_id;
END;
$$ LANGUAGE plpgsql;

--
-- Function: get_user_id
-- Parameters: _user_name (TEXT)
-- Usage: Returns the ID of _user_name. If _user_name does not exist, _user_name is added to the jira_user table and the new ID is returned.
--
CREATE OR REPLACE FUNCTION get_user_id(_user_name TEXT) RETURNS INTEGER AS $$
DECLARE
  user_id INTEGER;
BEGIN
  SELECT id INTO user_id FROM jira_user WHERE username = _user_name;
  IF user_id is NULL THEN
    INSERT INTO jira_user (username) VALUES (_user_name);
    SELECT id INTO user_id FROM jira_user WHERE username = _user_name;
  END IF;
  RETURN user_id; 
END;
$$ LANGUAGE plpgsql;

--
-- Function: add_feasibility
-- Parameters: (trigger procedures have special parameters: http://www.postgresql.org/docs/9.1/interactive/plpgsql-trigger.html)
-- Usage: This function replaces the reviewer, reporter, and project fields with their appropriate IDs and then inserts a new row into the feasibility table.
--
CREATE OR REPLACE FUNCTION add_feasibility() RETURNS TRIGGER AS $$
DECLARE
  reviewer_id INTEGER;
  reporter_id INTEGER;
  project_id INTEGER;
BEGIN
  SELECT get_user_id(NEW.reviewer_name) INTO reviewer_id;
  SELECT get_user_id(NEW.reporter_name) INTO reporter_id;
  SELECT get_project_id(NEW.project_name) INTO project_id;

  IF reviewer_id IS NULL OR reporter_id IS NULL OR project_id IS NULL THEN
    RAISE EXCEPTION 'Unable to locate the appropriate IDs for insertion.';
  ELSE
    INSERT INTO feasibility ( key, summary, fk_reviewer, fk_reporter, fk_project, created, resolution_date, 
                              design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, 
                              qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, 
                              feasibility_estimate_total, delta_percentage, delta ) 
    VALUES (NEW.key, NEW.summary, reviewer_id, reporter_id, project_id, NEW.created, NEW.resolution_date, 
            NEW.design_estimate, NEW.development_estimate, NEW.development_pad_estimate, NEW.pe_estimate, NEW.pm_estimate, 
            NEW.qa_estimate, NEW.issue_links, NEW.worklog, NEW.feasibility_timespent, NEW.issue_links_timespent, 
            NEW.feasibility_estimate_total, NEW.delta_percentage, NEW.delta);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--
-- TRIGGERS
--
CREATE TRIGGER v_feasibility_insert
  INSTEAD OF INSERT ON v_feasibility
  FOR EACH ROW
  EXECUTE PROCEDURE add_feasibility();
