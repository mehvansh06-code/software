
GUJARAT FLOTEX IMS - LOCAL SQL SETUP
=====================================

To run this application with the dedicated SQL backend on your local server:

1. PREREQUISITES:
   Install Node.js (version 16 or higher) from https://nodejs.org

2. INSTALLATION:
   Open your terminal in the project folder and run:
   npm install

3. START THE SQL BACKEND:
   Run the following command:
   node server.js

   You should see: "Gujarat Flotex SQL Backend running at http://localhost:3001"

4. DATA PERSISTENCE:
   The server will automatically create a file named 'ledger.db'. 
   This is your real SQL database. Do not delete it unless you want to wipe all data.

5. FRONTEND:
   Once the server is running, the Dashboard status will change to "SQL Server Live".
