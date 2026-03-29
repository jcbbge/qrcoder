--
-- PostgreSQL database dump
--

-- Dumped from database version 15.12
-- Dumped by pg_dump version 17.2

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: pages; Type: TABLE; Schema: public; Owner: koyeb-neon_owner
--

CREATE TABLE public.pages (
    id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'auto'::text,
    status text DEFAULT 'ready'::text,
    card_ids text DEFAULT '[]'::text,
    pdf_url text,
    custom_data text DEFAULT '{}'::text,
    metrics text DEFAULT '{"totalScans": 0, "printCount": 0, "downloadCount": 0}'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    printed_at timestamp without time zone,
    printed_by text,
    downloaded_at timestamp without time zone,
    downloaded_by text,
    CONSTRAINT pages_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'in_progress'::text, 'done'::text]))),
    CONSTRAINT pages_type_check CHECK ((type = ANY (ARRAY['auto'::text, 'custom'::text])))
);


ALTER TABLE public.pages OWNER TO "koyeb-neon_owner";

--
-- Name: pages_id_seq; Type: SEQUENCE; Schema: public; Owner: koyeb-neon_owner
--

CREATE SEQUENCE public.pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pages_id_seq OWNER TO "koyeb-neon_owner";

--
-- Name: pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: koyeb-neon_owner
--

ALTER SEQUENCE public.pages_id_seq OWNED BY public.pages.id;


--
-- Name: product_cards; Type: TABLE; Schema: public; Owner: koyeb-neon_owner
--

CREATE TABLE public.product_cards (
    id integer NOT NULL,
    shopify_id text,
    product_name text NOT NULL,
    artist_name text NOT NULL,
    price text,
    image_url text,
    onlineStoreUrl text,
    status text DEFAULT 'unassigned'::text,
    page_id integer,
    page_position integer,
    qr_code_generated integer DEFAULT 0,
    custom_data text DEFAULT '{}'::text,
    metrics text DEFAULT '{"scanCount": 0, "lastScanAt": null}'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    downloaded_at timestamp without time zone,
    printed_at timestamp without time zone,
    CONSTRAINT product_cards_status_check CHECK ((status = ANY (ARRAY['unprocessed'::text, 'assigned'::text, 'printed'::text])))
);


ALTER TABLE public.product_cards OWNER TO "koyeb-neon_owner";

--
-- Name: product_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: koyeb-neon_owner
--

CREATE SEQUENCE public.product_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_cards_id_seq OWNER TO "koyeb-neon_owner";

--
-- Name: product_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: koyeb-neon_owner
--

ALTER SEQUENCE public.product_cards_id_seq OWNED BY public.product_cards.id;


--
-- Name: queues; Type: TABLE; Schema: public; Owner: koyeb-neon_owner
--

CREATE TABLE public.queues (
    id integer NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'pending'::text,
    page_ids text DEFAULT '[]'::text,
    custom_data text DEFAULT '{}'::text,
    metrics text DEFAULT '{"totalPages": 0, "totalCards": 0}'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone,
    processed_by text,
    CONSTRAINT queues_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text])))
);


ALTER TABLE public.queues OWNER TO "koyeb-neon_owner";

--
-- Name: queues_id_seq; Type: SEQUENCE; Schema: public; Owner: koyeb-neon_owner
--

CREATE SEQUENCE public.queues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.queues_id_seq OWNER TO "koyeb-neon_owner";

--
-- Name: queues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: koyeb-neon_owner
--

ALTER SEQUENCE public.queues_id_seq OWNED BY public.queues.id;


--
-- Name: pages id; Type: DEFAULT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.pages ALTER COLUMN id SET DEFAULT nextval('public.pages_id_seq'::regclass);


--
-- Name: product_cards id; Type: DEFAULT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.product_cards ALTER COLUMN id SET DEFAULT nextval('public.product_cards_id_seq'::regclass);


--
-- Name: queues id; Type: DEFAULT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.queues ALTER COLUMN id SET DEFAULT nextval('public.queues_id_seq'::regclass);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: product_cards product_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.product_cards
    ADD CONSTRAINT product_cards_pkey PRIMARY KEY (id);


--
-- Name: product_cards product_cards_shopify_id_key; Type: CONSTRAINT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.product_cards
    ADD CONSTRAINT product_cards_shopify_id_key UNIQUE (shopify_id);


--
-- Name: queues queues_pkey; Type: CONSTRAINT; Schema: public; Owner: koyeb-neon_owner
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_pkey PRIMARY KEY (id);


--
-- Name: idx_pages_status; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_pages_status ON public.pages USING btree (status);


--
-- Name: idx_pages_type; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_pages_type ON public.pages USING btree (type);


--
-- Name: idx_product_cards_created_at; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_product_cards_created_at ON public.product_cards USING btree (created_at);


--
-- Name: idx_product_cards_page_id; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_product_cards_page_id ON public.product_cards USING btree (page_id);


--
-- Name: idx_product_cards_shopify_id; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_product_cards_shopify_id ON public.product_cards USING btree (shopify_id);


--
-- Name: idx_product_cards_status; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_product_cards_status ON public.product_cards USING btree (status);


--
-- Name: idx_queues_status; Type: INDEX; Schema: public; Owner: koyeb-neon_owner
--

CREATE INDEX idx_queues_status ON public.queues USING btree (status);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

