--
-- PostgreSQL database dump
--

\restrict 2yunhY18onMYR4V4y3jUU89v6aHZmfkFsJeb6qwWtPakNSFsChO6F0k36q9Y9dQ

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: log_table_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_table_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_row JSONB;
    v_case_id UUID;
    v_username VARCHAR(50);
BEGIN
    -- Actor identity: set by the trusted database session.
    v_username := COALESCE(
        NULLIF(
            current_setting('app.username', true),
            ''
        ),
        session_user
    );

    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        v_row := v_new;

    ELSIF TG_OP = 'UPDATE' THEN
    -- Skip UPDATE if no column value actually changed.
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
        RETURN NEW;
    END IF;

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;

    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_row := v_old;
    END IF;

    -- Never store plaintext or hashed passwords in audit JSON.
    IF TG_TABLE_NAME = 'users' THEN
        IF v_old IS NOT NULL THEN
            v_old := v_old - 'password';
        END IF;

        IF v_new IS NOT NULL THEN
            v_new := v_new - 'password';
        END IF;
    END IF;

    -- Find the related case where the row identifies one.
    IF TG_TABLE_NAME = 'adjournments' THEN
        SELECT h.case_id
        INTO v_case_id
        FROM public.hearings AS h
        WHERE h.hearing_id = (v_row ->> 'hearing_id')::UUID;

    ELSIF v_row ? 'case_id' THEN
        v_case_id := NULLIF(
            v_row ->> 'case_id', ''
        )::UUID;
    END IF;

    INSERT INTO public.audit_logs (
        log_id,
        case_id,
        action_type,
        old_data,
        new_data,
        changed_at,
        username
    )
    VALUES (
        gen_random_uuid(),
        v_case_id,
        TG_TABLE_NAME || ':' || TG_OP,
        v_old,
        v_new,
        clock_timestamp(),
        v_username
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adjournments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjournments (
    adj_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    hearing_id uuid,
    reason_code character varying(255) NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    log_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_id uuid,
    action_type character varying(50) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    username character varying(50)
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    case_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_number character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'Filed'::character varying NOT NULL,
    filing_date date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT cases_status_check CHECK (((status)::text = ANY ((ARRAY['Filed'::character varying, 'Active'::character varying, 'Adjourned'::character varying, 'Disposed'::character varying, 'Closed'::character varying])::text[])))
);


--
-- Name: dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispositions (
    disp_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_id uuid,
    final_judgment text NOT NULL,
    disposition_date date DEFAULT CURRENT_DATE
);


--
-- Name: filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filings (
    filing_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_id uuid,
    party_id uuid,
    filing_type character varying(100) NOT NULL,
    filing_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: hearings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hearings (
    hearing_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_id uuid,
    judge_id uuid,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    CONSTRAINT valid_time_range CHECK ((end_time > start_time))
);


--
-- Name: judges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.judges (
    judge_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    active_status boolean DEFAULT true
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    order_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    case_id uuid,
    judge_id uuid,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    details text NOT NULL
);


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    party_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    party_type character varying(50) NOT NULL,
    CONSTRAINT parties_party_type_check CHECK (((party_type)::text = ANY ((ARRAY['Petitioner'::character varying, 'Respondent'::character varying, 'Lawyer'::character varying])::text[])))
);


--
-- Name: party_case_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_case_roles (
    party_id uuid NOT NULL,
    case_id uuid NOT NULL,
    role_type character varying(50) NOT NULL
);


--
-- Name: party_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_phones (
    party_id uuid NOT NULL,
    phone_number character varying(15) NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20),
    judge_id uuid,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'clerk'::character varying, 'judge'::character varying])::text[])))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: adjournments adjournments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjournments
    ADD CONSTRAINT adjournments_pkey PRIMARY KEY (adj_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id);


--
-- Name: cases cases_case_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_case_number_key UNIQUE (case_number);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (case_id);


--
-- Name: dispositions dispositions_case_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositions
    ADD CONSTRAINT dispositions_case_id_key UNIQUE (case_id);


--
-- Name: dispositions dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositions
    ADD CONSTRAINT dispositions_pkey PRIMARY KEY (disp_id);


--
-- Name: filings filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filings
    ADD CONSTRAINT filings_pkey PRIMARY KEY (filing_id);


--
-- Name: hearings hearings_judge_id_tsrange_excl; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_judge_id_tsrange_excl EXCLUDE USING gist (judge_id WITH =, tsrange(start_time, end_time) WITH &&);


--
-- Name: hearings hearings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_pkey PRIMARY KEY (hearing_id);


--
-- Name: judges judges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.judges
    ADD CONSTRAINT judges_pkey PRIMARY KEY (judge_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (party_id);


--
-- Name: party_case_roles party_case_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_case_roles
    ADD CONSTRAINT party_case_roles_pkey PRIMARY KEY (party_id, case_id);


--
-- Name: party_phones party_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_phones
    ADD CONSTRAINT party_phones_pkey PRIMARY KEY (party_id, phone_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: users_judge_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_judge_id_unique ON public.users USING btree (judge_id) WHERE (judge_id IS NOT NULL);


--
-- Name: adjournments audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.adjournments FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: cases audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: dispositions audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.dispositions FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: filings audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.filings FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: hearings audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.hearings FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: judges audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.judges FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: orders audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: parties audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: party_case_roles audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.party_case_roles FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: party_phones audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.party_phones FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: users audit_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_changes AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.log_table_changes();


--
-- Name: adjournments adjournments_hearing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjournments
    ADD CONSTRAINT adjournments_hearing_id_fkey FOREIGN KEY (hearing_id) REFERENCES public.hearings(hearing_id) ON DELETE CASCADE;


--
-- Name: dispositions dispositions_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositions
    ADD CONSTRAINT dispositions_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(case_id) ON DELETE CASCADE;


--
-- Name: filings filings_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filings
    ADD CONSTRAINT filings_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(case_id) ON DELETE CASCADE;


--
-- Name: filings filings_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filings
    ADD CONSTRAINT filings_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(party_id) ON DELETE CASCADE;


--
-- Name: hearings hearings_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(case_id) ON DELETE CASCADE;


--
-- Name: hearings hearings_judge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_judge_id_fkey FOREIGN KEY (judge_id) REFERENCES public.judges(judge_id) ON DELETE RESTRICT;


--
-- Name: orders orders_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(case_id) ON DELETE CASCADE;


--
-- Name: orders orders_judge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_judge_id_fkey FOREIGN KEY (judge_id) REFERENCES public.judges(judge_id) ON DELETE RESTRICT;


--
-- Name: party_case_roles party_case_roles_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_case_roles
    ADD CONSTRAINT party_case_roles_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(case_id) ON DELETE CASCADE;


--
-- Name: party_case_roles party_case_roles_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_case_roles
    ADD CONSTRAINT party_case_roles_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(party_id) ON DELETE CASCADE;


--
-- Name: party_phones party_phones_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_phones
    ADD CONSTRAINT party_phones_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(party_id) ON DELETE CASCADE;


--
-- Name: users users_judge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_judge_id_fkey FOREIGN KEY (judge_id) REFERENCES public.judges(judge_id);


--
-- PostgreSQL database dump complete
--

\unrestrict 2yunhY18onMYR4V4y3jUU89v6aHZmfkFsJeb6qwWtPakNSFsChO6F0k36q9Y9dQ

