# NodeJS/postgreSQL ETL Example

**E** - Extract (feasibility data via the JIRA API)

**T** - Transform (the data to an appropriate/useable schema)

**L** - Load (data into a database)

## Description
This is an example ETL script written in NodeJS and postgreSQL. I wrote this for a company so there is some business logic in the code that won't make sense outside of the context it was written in. However, I still think this example is worth publishing as it gives a solid example of what an ETL script written in NodeJS could look like (async, request, pg, lodash) as well as good examples of some postgreSQL functionality (CTEs, Views, Triggers, Procedure Triggers, misc. best practices). 

This README will breakdown the features of the etl script and the database system. The goal is to make this codebase and the concepts covered by the code useful to someone trying to do this themselves or someone who is curious about NodeJS/postgreSQL interactions. 

### Overview
The goal of the project was to compare the development estimates engineers logged in feasibility tickets with the actual time spent on the development tickets related to said feasibility ticket. By comparing the feasibility tickets with the actual development tickets, we gain a better understanding of how good we are as estimators and can adjust our practices accordingly. 

For context, here is a brief overview of what the script is doing:
1. Request, from the JIRA API via JQL (JIRA Query Language), all tickets that match the JQL critera as defined in config.json "jira_api_jql". These are all the feasibility tickets. 
2. For each feasibility ticket, request data about the corresponding development tickets.
3. Run error checks on the data we requested.
4. If everything appears OK, transform the JIRA API responses into something we can load into the postgreSQL database.
5. Finally, load all the data into the postgreSQL database.

## Database
For this project, I based the database system around the concept of "Views". Read more on postgreSQL "Views" [here](http://www.postgresqltutorial.com/managing-postgresql-views/).

### View
In short, utilizing a "View" for this project allowed me to create a properly normalized database while at the same time allowing any application interacting with the database to use simple queries (i.e. not worry about the ramifications of the normalization in terms of query/database complexity).

I created a diagram to highlight these benefits. You can see in the image below that incoming queries are made only against the View. The database view logic combined with the trigger procedure allows reads and insertions directly from the view without having to worry about the underlying tables and their constraints. 

![diagram](https://cloud.githubusercontent.com/assets/2591298/25360172/0c410da0-2916-11e7-8a66-5b70cd9e6439.png)

### CTEs
**Common Table Expressions**

I utilized a couple of CTEs while creating my view. Instead of creating my view with a handful of nested queries, I split the query up by defining the CTEs and then referencing them in my SELECT statement. It should be clear what is happening in schema.sql. This is a pretty basic utilization of CTEs. For more on CTEs, check [this post](http://www.craigkerstiens.com/2013/11/18/best-postgres-feature-youre-not-using/) out.


## ETL Script
The script itself should be pretty straight forward. I utilized async to control the flow of execution. The script leans of various helper functions defined in lib/helpers.js.

Useage:
`node etl.js`

### Features
The script has some handy features that are worth highlighting. 

#### Error Threshold
This ETL script was created to make several hundred network requests via the JIRA API to retrieve the relevant data to transform and parse. If some network requests fail, which they tend to do (especially when dealing with the JIRA API _cough_), I didn't want to halt the execution of the entire script. The data loaded into the database would still be valid for our purposes even if a handful of feasibilities failed to be loaded. In config.json, the key "supplemental_threshold_percentage" determines how many requests can fail before we consider the execution a failure. I utilize a percent change formula to determine the size of the data set when validating the requests. If the percent change is greater than or equal to the "supplemental_threshold_percentage", the script will fail and an error message will be displayed accordingly. If the percent change is less than the threshold, the script will continue to run and load data into the database. 


#### Logging
Logging was very important for this project both during development and for running the script in a production environment. Log files support logging for a production environment and console output supports local development. 

_Note: Since I am no longer with the company this project was written for, I am unable to provide image examples for all logging situations (which is unfortunate because the color coding really stands out during development and makes it very easy to understand what the script is doing during execution)._

##### Console Output
Including the `--logger` flag (either as a command line argument, config option, or environment variable) will enable request logs. All network requests to the JIRA API will be logged to the console along with status codes and timestampes (all color coordinated). Use this for debugging erroneous requests or while developing to make sure things are working as expected.

The logger option will also enable query logging. The query logs will show you the SQL statement, success flag, timestamp, and error message (all color coordinated).

Here is a screenshot of the request logs:
![log](https://cloud.githubusercontent.com/assets/2591298/25360173/0c4af00e-2916-11e7-9d8c-ce3a16461b04.png)


##### Log Files
On top of console logs, actual text logs are populated when this script executes. These files can be used in conjunction with build automation technology to determine success or failure of the ETL script. Executing the script outputs a DATE.txt in `logs/` (where DATE is in the format of MM-DD-YYYY) regardless of if the 'logger' option is set. The code is set up to only ever have 3 log files at a given time. This is to prevent the script from consuming a large amount of space on disc. Once a log file becomes 3 days old, the script will delete it before making another one. The `/logs` directory has been added to the .gitignore file so that it will not pollute the codebase.

Below is an example of what the log file might look like for network requests:
```
---------------------------
timestamp: Monday, April 24th 2017, 12:18:00 pm
URL: http://www.google.com/rest/api/2/search
status: 404
---------------------------
---------------------------
timestamp: Monday, April 24th 2017, 12:18:07 pm
URL: http://www.google.com/rest/api/2/search
status: 404
---------------------------
```


### Development
A couple of very important parameters to be aware of before you begin development:

_note: All of these support environment variables and command line overrides - I recommend you set up permanent environment variables on your machine for username, password, and max results if you plan on developing._

#### max_results
**This is crucial for development, otherwise you could overload and consequently crash the JIRA servers.** This dictates the max results returned from the initial `/api/search` call. If this number is high, the API will be crushed by a large number of requests and may crash. I recommend using a small, single digit number during development. If testing with larger data sets is necessary, be sure to test during low load hours.

#### username / password
**username** - JIRA API username (can use your JIRA sign in credentials)
**password** - JIRA API password (can use your JIRA sign in credentials)

Example: `node etl.js --username "username" --password "password" --max_results 3`

Example (recommended): 
``` bash
export username='username'
export password='password'
export max_results='3'
node etl.js
```

#### constring
constring represents the URL in which the database can be accessed.

Example: `node etl.js --username "username" --password "password" --max_results 3 --constring "postgres://nathanhega:password1@localhost/postgres"`

Example (recommended): 
``` bash
export username='username'
export password='password'
export max_results='3'
export constring='postgres://nathanhega:password1@localhost/postgres'
node etl.js
```
