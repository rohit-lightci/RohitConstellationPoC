#!/bin/bash

# Terminate existing connections
PGPASSWORD=postgres psql -h localhost -p 54444 -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rohit-constellation';"

# Drop database (this needs to be a separate command)
PGPASSWORD=postgres psql -h localhost -p 54444 -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"rohit-constellation\";"

# Create database
PGPASSWORD=postgres psql -h localhost -p 54444 -U postgres -d postgres -c "CREATE DATABASE \"rohit-constellation\";" 