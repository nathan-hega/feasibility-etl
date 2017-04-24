
--
-- TEST: FUNCTIONS
--

-- SUCCESS: 'new.user.test' should appear in the jira_user table
SELECT get_user_id('new.user.test');
SELECT * FROM jira_user;

-- SUCCESS: 'NEWPROJ' should appear in the project table
SELECT get_project_id('NEWPROJ');
SELECT * FROM project;


--
-- TEST: BASIC INSERTS
--

INSERT INTO jira_user (username) VALUES ('user1');
INSERT INTO jira_user (username) VALUES ('user2');
INSERT INTO jira_user (username) VALUES ('user3');
INSERT INTO jira_user (username) VALUES ('user4');

INSERT INTO project (name) VALUES ('PROJECT1');
INSERT INTO project (name) VALUES ('PROJECT2');
INSERT INTO project (name) VALUES ('PROJECT3');
INSERT INTO project (name) VALUES ('PROJECT4');
INSERT INTO project (name) VALUES ('PROJECT5');


--
-- TEST: INSERT INTO v_feasibility 
--
TRUNCATE TABLE feasibility, project, jira_user;

--
-- Insert 1: Feasibility ticket with one associated task.
--
INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, 
            design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, 
            qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta_percentage, delta) 
  VALUES ('PROJECT1-1090', 'Test Feasibility A', 'user1', 'user1', 'PROJECT1', '1999-01-08 04:05:06', '1999-02-08 04:05:06', 1.2, 2, 1, 1.5, 1, 1.5, 
          '{"PROJECT1-1254":{"summary":"Test Task A","status":"To Do","issuetype":"Task","worklog":{"worklog":[{"author":"user1","timespent":60,"unit":"seconds","id":"111111"},{"author":"user1","timespent":60,"unit":"seconds","id":"111112"},{"author":"user1","timespent":60,"unit":"seconds","id":"111113"}],"total":180},"reporter":"user2","project":"PROJECT1","created":"2015-06-12T17:16:51.263+0000","resolution":null,"resolution date":null}}', 
          '{"worklog":[{"author":"user1","timespent":60,"unit":"seconds","id":"111114"}],"total":60}', 3600, 10800, 29520, 198.02, 234);

--
-- Insert 2: Feasibility ticket, no associated tasks.
--
INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, 
            design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, 
            qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta_percentage, delta)
  VALUES ('PROJECT2-123', 'Test Feasibility B', 'user2', 'user1', 'PROJECT2', '2014-01-08 04:05:06', '2014-02-08 04:05:06', 1.2, 2, 1, 1.5, 1, 1.5,
          null, null, 29520, 10800, 3600, 98.2454, 12453);

--
-- Insert 3: Feasibility ticket, no associated tasks.
--
INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, 
            design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate,
            qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta_percentage, delta) 
  VALUES ('PROJECT5-1999', 'Test Feasibility C', 'user4', 'user3', 'PROJECT5', '2014-01-08 04:05:06', '2014-02-08 04:05:06', 1.2, 2, 1, 1.5, 1, 1.5, 
          null, null, 29520, 10800, 3600, null, null);

--
-- Insert 4: Feasibility ticket, no associated tasks.
--
INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, 
            design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate,
            qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta_percentage, delta) 
  VALUES ('PROJECT5-2000', 'Test Feasibility D', 'user2', 'user4', 'PROJECT5', '2014-01-08 04:05:06', '2014-02-08 04:05:06', 1.2, 2, 1, 1.5, 1, 1.5, 
          null, '{"worklog":[{"author":"user1","timespent":60,"unit":"seconds","id":"11115"}],"total":60}', 13213, 2515, 57415, 124.2454, 777);
  
  --
  -- Insert 5: Feasibility ticket, no associated tasks.
  --
INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, 
  design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, qa_estimate, 
  issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta_percentage, delta) 
  VALUES ('PROJECT4-342', 'Test Feasibility E', 'user1', 'user2', 'PROJECT4', 
    '2014-01-08 04:05:06', '2014-02-08 04:05:06', 1.2, 2, 1, 1.5, 1, 1.5, null, null, 9879, 987842, 121, null, null);


--
-- TEST: BASIC SELECTS
--

-- SUCCESS: All tables should have the appropriate test data based on the inserts above.
SELECT * FROM v_feasibility;
SELECT * FROM feasibility;
SELECT * FROM project;
SELECT * FROM jira_user;
