"""
Court Case Management System - Data Generator
==============================================
Generates realistic fake data and populates the development database.

WARNING: SAFETY POLICY
-----------------------
This script MUST ONLY be run against a dedicated development database.
It will REFUSE to run against 'court_case_db' (the production database) by default.

Usage:
    1. Copy .env.example to .env at the project root.
    2. Fill in your DEV database credentials (NOT court_case_db).
    3. Run: python data_generation/data_generation.py
"""

import os
import sys
import random
from datetime import timedelta
from pathlib import Path

import psycopg
from psycopg import errors as pg_errors
from faker import Faker
from dotenv import load_dotenv

# ---------------------------------------------------------
# LOAD ENVIRONMENT VARIABLES FROM PROJECT ROOT .env
# ---------------------------------------------------------
# Resolve the project root (one directory up from this file's location)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
dotenv_path  = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=dotenv_path)

DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_NAME     = os.getenv("DB_NAME",     "")
DB_USER     = os.getenv("DB_USER",     "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_PORT     = os.getenv("DB_PORT",     "5432")

# ---------------------------------------------------------
# PRODUCTION GUARD
# The generator refuses to run against these database names.
# ---------------------------------------------------------
BLOCKED_DATABASES = {"court_case_db"}

# ---------------------------------------------------------
# DATA GENERATION VARIABLES (preserved from original)
# ---------------------------------------------------------
NUM_JUDGES  = 20
NUM_PARTIES = 500
NUM_CASES   = 1000  # Ye 1000 cases generate karega (Total rows 10,000+ cross ho jayengi)

# Faker initialize karein (Indian names aur data generate karne ke liye)
fake = Faker('en_IN')


# ---------------------------------------------------------
# SAFETY CONFIRMATION
# ---------------------------------------------------------
def safety_check():
    """
    Perform pre-flight safety checks and get explicit user confirmation
    before any database connection or data insertion occurs.
    """
    if not DB_NAME:
        print("\n[ERROR] DB_NAME is not set in your .env file.")
        print("        Copy .env.example to .env and fill in your DEV credentials.")
        sys.exit(1)

    # --- Production guard ---
    if DB_NAME.strip().lower() in BLOCKED_DATABASES:
        print("\n" + "=" * 62)
        print("  BLOCKED:  PRODUCTION DATABASE DETECTED -- REFUSING TO RUN")
        print("=" * 62)
        print(f"\n  Target database  : {DB_NAME}")
        print(f"  Blocked list     : {sorted(BLOCKED_DATABASES)}")
        print()
        print("  The data generator will NOT insert records into this database.")
        print("  Create a separate development database (e.g. 'court_case_dev')")
        print("  and set DB_NAME=court_case_dev in your .env file.\n")
        sys.exit(1)

    # --- Confirmation prompt ---
    print("\n" + "=" * 62)
    print("   DATA GENERATION  --  SAFETY CONFIRMATION REQUIRED")
    print("=" * 62)
    print(f"\n  Target host      : {DB_HOST}:{DB_PORT}")
    print(f"  Target database  : {DB_NAME}")
    print(f"  Target user      : {DB_USER}")
    print()
    print("  This will INSERT the following rows into the target database:")
    print(f"    {NUM_JUDGES:<5} Judges")
    print(f"    {NUM_PARTIES:<5} Parties  (+750-1000 Phone Numbers)")
    print(f"    {NUM_CASES:<5} Cases    (+Party Roles, Hearings, Orders, Dispositions)")
    print()
    print("  Total estimated rows: 10,000+")
    print("=" * 62)
    confirm = input("\n  Type  YES  (all caps) to proceed, or anything else to abort: ").strip()
    if confirm != "YES":
        print("\n  Aborted. No data was inserted.\n")
        sys.exit(0)
    print()


# ---------------------------------------------------------
# DATA GENERATION LOGIC (original logic preserved exactly)
# ---------------------------------------------------------
def generate_data(conn):
    """Insert all fake records using the provided open psycopg v3 connection."""

    # Memory lists (taaki aage foreign keys link kar sakein)
    judge_ids   = []
    party_ids   = []
    case_ids    = []
    hearing_ids = []

    print("Generating Data. This might take a minute or two...")

    # Outer transaction: issues BEGIN on entry.
    # On clean exit (all sections succeed) -> COMMIT.
    # On any unhandled exception              -> ROLLBACK everything.
    with conn.transaction():
        with conn.cursor() as cursor:

            # 1. GENERATE JUDGES
            print("Inserting Judges...")
            for _ in range(NUM_JUDGES):
                name   = f"Hon'ble Justice {fake.name()}"
                status = random.choice([True, True, True, False])  # Mostly true
                cursor.execute(
                    "INSERT INTO Judges (name, active_status) VALUES (%s, %s) RETURNING judge_id",
                    (name, status),
                )
                judge_ids.append(cursor.fetchone()[0])

            # 2. GENERATE PARTIES (and Phone Numbers)
            print("Inserting Parties...")
            party_types = ['Petitioner', 'Respondent', 'Lawyer']
            for _ in range(NUM_PARTIES):
                name   = fake.name()
                p_type = random.choice(party_types)
                cursor.execute(
                    "INSERT INTO Parties (name, party_type) VALUES (%s, %s) RETURNING party_id",
                    (name, p_type),
                )
                p_id = cursor.fetchone()[0]
                party_ids.append(p_id)

                # Generate 1 or 2 phone numbers per party
                for _ in range(random.randint(1, 2)):
                    # Ensure exact 10 digits for phone number to avoid VARCHAR limit errors if any
                    phone = fake.numerify(text='##########')
                    cursor.execute(
                        "INSERT INTO Party_Phones (party_id, phone_number) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (p_id, phone),
                    )

            # 3. GENERATE CASES
            print("Inserting Cases...")
            statuses = ['Filed', 'Active', 'Adjourned', 'Disposed', 'Closed']
            while len(case_ids) < NUM_CASES:
                case_no     = f"CC-{fake.year()}-{random.randint(100000, 9999999)}"
                status      = random.choice(statuses)
                filing_date = fake.date_between(start_date='-5y', end_date='today')
                try:
                    with conn.transaction():          # nested: SAVEPOINT (inside outer BEGIN)
                        cursor.execute(
                            "INSERT INTO Cases (case_number, status, filing_date)"
                            " VALUES (%s, %s, %s) RETURNING case_id",
                            (case_no, status, filing_date),
                        )
                        new_case_id = cursor.fetchone()[0]
                except pg_errors.UniqueViolation:
                    continue                          # ROLLBACK TO SAVEPOINT; outer tx intact
                case_ids.append(new_case_id)          # only reached when savepoint released successfully

            # 4. GENERATE PARTY_CASE_ROLES (Bridge Table)
            print("Mapping Parties to Cases...")
            for case_id in case_ids:
                # Randomly assign 2 to 4 parties per case
                assigned_parties = random.sample(party_ids, k=random.randint(2, 4))
                for p_id in assigned_parties:
                    role = random.choice(['Lead Counsel', 'Applicant', 'Defendant'])
                    cursor.execute(
                        "INSERT INTO Party_Case_Roles (party_id, case_id, role_type) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                        (p_id, case_id, role),
                    )

            # 5. GENERATE HEARINGS (With safe times to avoid conflicts)
            print("Scheduling Hearings...")
            for case_id in case_ids:
                # Not all cases have hearings yet
                if random.choice([True, False]):
                    j_id    = random.choice(judge_ids)
                    # To avoid the strictly enforced overlap constraint, we pick a very random specific time
                    h_start = fake.date_time_between(start_date='-1y', end_date='+1y')
                    # Hearing lasts 1 hour
                    h_end   = h_start + timedelta(hours=1)

                    try:
                        with conn.transaction():      # nested: SAVEPOINT (inside outer BEGIN)
                            cursor.execute(
                                "INSERT INTO Hearings (case_id, judge_id, start_time, end_time)"
                                " VALUES (%s, %s, %s, %s) RETURNING hearing_id",
                                (case_id, j_id, h_start, h_end),
                            )
                            new_hearing_id = cursor.fetchone()[0]
                    except pg_errors.ExclusionViolation:
                        # Our database constraint worked! The judge was double booked, so it blocked it.
                        continue                      # ROLLBACK TO SAVEPOINT; prior hearings preserved
                    hearing_ids.append(new_hearing_id)  # only reached when savepoint released successfully

            # 6. GENERATE ORDERS & DISPOSITIONS
            print("Generating Orders and Dispositions...")
            for case_id in case_ids:
                # Add an order
                if random.choice([True, False]):
                    j_id       = random.choice(judge_ids)
                    order_date = fake.date_between(start_date='-1y', end_date='today')
                    details    = fake.sentence(nb_words=10)
                    cursor.execute(
                        "INSERT INTO Orders (case_id, judge_id, order_date, details) VALUES (%s, %s, %s, %s)",
                        (case_id, j_id, order_date, details),
                    )

                # Add a disposition if the case status requires it
                cursor.execute("SELECT status FROM Cases WHERE case_id = %s", (case_id,))
                status = cursor.fetchone()[0]
                if status in ['Disposed', 'Closed']:
                    judgement = fake.paragraph(nb_sentences=3)
                    disp_date = fake.date_between(start_date='-1m', end_date='today')
                    cursor.execute(
                        "INSERT INTO Dispositions (case_id, final_judgment, disposition_date) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                        (case_id, judgement, disp_date),
                    )

    # conn.transaction().__exit__ issues the single COMMIT here (all six sections succeeded).
    # No explicit conn.commit() calls are needed anywhere in this function.


# ---------------------------------------------------------
# MAIN EXECUTION BLOCK
# Database connection happens ONLY here, AFTER confirmation.
# ---------------------------------------------------------
if __name__ == "__main__":

    # Step 1: Safety check and user confirmation (no DB connection yet)
    safety_check()

    # Step 2: Connect to the database only after explicit confirmation
    try:
        conn = psycopg.connect(
            host=DB_HOST,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            port=DB_PORT,
        )
        print("Database connected successfully!")
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

    # Step 3: Generate and insert all data; always close the connection
    try:
        generate_data(conn)
    except Exception:
        # The outer conn.transaction() inside generate_data() has already issued ROLLBACK
        # before this point. This call is belt-and-suspenders: a harmless no-op if the
        # transaction context manager has already closed the transaction.
        conn.rollback()
        raise
    finally:
        conn.close()

    print("[SUCCESS] Database is now populated with thousands of records!")
