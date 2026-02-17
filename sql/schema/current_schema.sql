create table sg_reports_survey.users
(
	id uuid default gen_random_uuid() not null
		primary key,
	email text not null
		unique,
	entity text,
	created_at timestamp with time zone default now(),
	last_login_at timestamp with time zone,
	role text default 'user'::text not null
		constraint users_role_check
			check (role = ANY (ARRAY['user'::text, 'admin'::text]))
);

create table sg_reports_survey.magic_tokens
(
	token text not null
		primary key,
	email text not null,
	expires_at timestamp with time zone not null,
	used_at timestamp with time zone
);

create index idx_magic_tokens_expires
	on sg_reports_survey.magic_tokens (expires_at);

create index idx_magic_tokens_cleanup
	on sg_reports_survey.magic_tokens (expires_at)
	where (used_at IS NULL);

create table sg_reports_survey.reports
(
	id serial
		primary key,
	record_number text,
	symbol text not null
		constraint unique_symbol
			unique,
	symbol_split text[],
	symbol_split_n integer,
	session_or_year text,
	date text,
	date_year integer,
	publication_date text,
	proper_title text,
	title text,
	subtitle text[],
	other_title text,
	uniform_title text,
	resource_type_level2 text[],
	resource_type_level3 text[],
	un_body text,
	corporate_name_level1 text,
	corporate_name_level2 text,
	conference_name text,
	subject_terms text[],
	agenda_document_symbol text,
	agenda_item_number text[],
	agenda_item_title text[],
	agenda_subjects text[],
	related_resource_identifier text[],
	is_part boolean default false,
	symbol_without_prefix text,
	symbol_without_prefix_split text[],
	symbol_without_prefix_split_n integer,
	note text,
	text text,
	raw_json jsonb,
	created_at timestamp with time zone default now(),
	updated_at timestamp with time zone default now(),
	embedding vector(1024),
	word_count integer,
	document_category text,
	based_on_resolution_symbols text[]
);

comment on column sg_reports_survey.reports.embedding is 'Vector embedding from text-embedding-3-large (1024 dimensions) for semantic similarity search';

create index idx_reports_symbol
	on sg_reports_survey.reports (symbol);

create index idx_reports_proper_title
	on sg_reports_survey.reports (proper_title);

create index idx_reports_date_year
	on sg_reports_survey.reports (date_year);

create index idx_reports_resource_type_level3
	on sg_reports_survey.reports using gin (resource_type_level3);

create index idx_reports_subject_terms
	on sg_reports_survey.reports using gin (subject_terms);

create index idx_reports_raw_json
	on sg_reports_survey.reports using gin (raw_json);

create index idx_reports_text_search
	on sg_reports_survey.reports using gin (to_tsvector('english'::regconfig, COALESCE(text, ''::text)));

create index idx_reports_embedding
	on sg_reports_survey.reports using hnsw (embedding public.vector_cosine_ops);

create index idx_reports_based_on_resolution_symbols
	on sg_reports_survey.reports using gin (based_on_resolution_symbols);

create index idx_reports_document_category
	on sg_reports_survey.reports (document_category);

create table sg_reports_survey.allowed_domains
(
	entity text not null,
	domain text not null,
	primary key (entity, domain)
);

comment on table sg_reports_survey.allowed_domains is 'Allowed email domains. Entity ''*'' means allowed globally.';

create table sg_reports_survey.report_entity_suggestions
(
	id serial
		primary key,
	proper_title text not null,
	entity text not null
		references ??? (),
	source text not null
		constraint report_entity_suggestions_source_check
			check (source = ANY (ARRAY['dgacm'::text, 'dri'::text, 'ai'::text])),
	confidence_score numeric(4,3)
		constraint report_entity_suggestions_confidence_score_check
			check ((confidence_score IS NULL) OR ((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
	match_details jsonb,
	created_at timestamp with time zone default now(),
	constraint unique_suggestion_per_source
		unique (proper_title, entity, source)
);

create index idx_suggestions_proper_title
	on sg_reports_survey.report_entity_suggestions (proper_title);

create index idx_suggestions_entity
	on sg_reports_survey.report_entity_suggestions (entity);

create index idx_suggestions_source
	on sg_reports_survey.report_entity_suggestions (source);

grant select on sg_reports_survey.report_entity_suggestions to chat_readonly;

create table sg_reports_survey.report_entity_confirmations
(
	id serial
		primary key,
	proper_title text not null,
	entity text not null
		references ??? (),
	confirmed_by_user_id uuid not null
		references sg_reports_survey.users,
	confirmed_at timestamp with time zone default now(),
	notes text,
	role text default 'lead'::text not null
		constraint report_entity_confirmations_role_check
			check (role = ANY (ARRAY['lead'::text, 'contributing'::text])),
	constraint unique_confirmation_per_entity
		unique (proper_title, entity)
);

create index idx_confirmations_proper_title
	on sg_reports_survey.report_entity_confirmations (proper_title);

create index idx_confirmations_entity
	on sg_reports_survey.report_entity_confirmations (entity);

create index idx_confirmations_user
	on sg_reports_survey.report_entity_confirmations (confirmed_by_user_id);

create index idx_confirmations_role
	on sg_reports_survey.report_entity_confirmations (proper_title, role);

grant select on sg_reports_survey.report_entity_confirmations to chat_readonly;

create table sg_reports_survey.documents
(
	id serial
		primary key,
	record_number text,
	symbol text not null
		constraint unique_document_symbol
			unique,
	symbol_split text[],
	symbol_split_n integer,
	document_category text,
	session_or_year text,
	date text,
	date_year integer,
	publication_date text,
	proper_title text,
	title text,
	subtitle text[],
	other_title text,
	uniform_title text,
	resource_type_level2 text[],
	resource_type_level3 text[],
	un_body text,
	corporate_name_level1 text,
	corporate_name_level2 text,
	conference_name text,
	subject_terms text[],
	agenda_document_symbol text,
	agenda_item_number text[],
	agenda_item_title text[],
	agenda_subjects text[],
	related_resource_identifier text[],
	is_part boolean default false,
	symbol_without_prefix text,
	symbol_without_prefix_split text[],
	symbol_without_prefix_split_n integer,
	note text,
	based_on_resolution_symbols text[],
	text text,
	embedding vector(1024),
	raw_json jsonb,
	created_at timestamp with time zone default now(),
	updated_at timestamp with time zone default now(),
	word_count integer,
	data_source text default 'library'::text not null
		constraint documents_data_source_check
			check (data_source = ANY (ARRAY['library'::text, 'manual'::text])),
	created_by_user_id uuid
		references sg_reports_survey.users
);

create index idx_documents_symbol
	on sg_reports_survey.documents (symbol);

create index idx_documents_document_category
	on sg_reports_survey.documents (document_category);

create index idx_documents_proper_title
	on sg_reports_survey.documents (proper_title);

create index idx_documents_date_year
	on sg_reports_survey.documents (date_year);

create index idx_documents_resource_type_level3
	on sg_reports_survey.documents using gin (resource_type_level3);

create index idx_documents_subject_terms
	on sg_reports_survey.documents using gin (subject_terms);

create index idx_documents_based_on_resolution_symbols
	on sg_reports_survey.documents using gin (based_on_resolution_symbols);

create index idx_documents_raw_json
	on sg_reports_survey.documents using gin (raw_json);

create index idx_documents_text_search
	on sg_reports_survey.documents using gin (to_tsvector('english'::regconfig, COALESCE(text, ''::text)));

create index idx_documents_embedding
	on sg_reports_survey.documents using hnsw (embedding public.vector_cosine_ops);

create index idx_documents_data_source
	on sg_reports_survey.documents (data_source);

grant select on sg_reports_survey.documents to chat_readonly;

create table sg_reports_survey.resolution_mandates
(
	id serial
		primary key,
	resolution_symbol text not null,
	verbatim_paragraph text,
	summary text,
	explicit_frequency text,
	implicit_frequency text,
	frequency_reasoning text,
	raw_response jsonb,
	created_at timestamp default now()
);

create unique index idx_resolution_mandates_unique
	on sg_reports_survey.resolution_mandates (resolution_symbol, md5(COALESCE(verbatim_paragraph, ''::text)));

grant select on sg_reports_survey.resolution_mandates to chat_readonly;

create table sg_reports_survey.survey_responses
(
	id serial
		primary key,
	proper_title text not null,
	latest_symbol text not null,
	user_entity text not null,
	status text not null
		constraint survey_responses_status_check
			check (status = ANY (ARRAY['continue'::text, 'merge'::text, 'discontinue'::text])),
	frequency text
		constraint survey_responses_frequency_check
			check ((frequency IS NULL) OR (frequency = ANY (ARRAY['multiple'::text, 'annual'::text, 'biennial'::text, 'triennial'::text, 'quadrennial'::text, 'one-time'::text]))),
	format text
		constraint survey_responses_format_check
			check ((format IS NULL) OR (format = ANY (ARRAY['shorter'::text, 'oral'::text, 'dashboard'::text, 'other'::text, 'no-change'::text]))),
	format_other text,
	merge_targets text[],
	discontinue_reason text,
	comments text,
	created_at timestamp with time zone default now(),
	updated_at timestamp with time zone default now(),
	normalized_body text default ''::text not null,
	responded_by_user_id uuid not null
		references sg_reports_survey.users,
	constraint survey_responses_unique_per_user_per_report_body
		unique (proper_title, normalized_body, responded_by_user_id)
);

comment on table sg_reports_survey.survey_responses is 'Entity survey responses for SG report recommendations (one per entity per report)';

comment on column sg_reports_survey.survey_responses.proper_title is 'Report group identifier - all versions share this';

comment on column sg_reports_survey.survey_responses.latest_symbol is 'Most recent document symbol for this report group';

comment on column sg_reports_survey.survey_responses.user_entity is 'Entity making the recommendation (unique per report)';

comment on column sg_reports_survey.survey_responses.status is 'Recommendation: continue, merge, or discontinue';

comment on column sg_reports_survey.survey_responses.frequency is 'Recommended frequency (when status=continue)';

comment on column sg_reports_survey.survey_responses.format is 'Recommended format (when status=continue)';

comment on column sg_reports_survey.survey_responses.merge_targets is 'Array of symbols to merge with (when status=merge)';

create index idx_responses_proper_title
	on sg_reports_survey.survey_responses (proper_title);

create index idx_responses_user_entity
	on sg_reports_survey.survey_responses (user_entity);

create index idx_responses_status
	on sg_reports_survey.survey_responses (status);

create index idx_responses_created_at
	on sg_reports_survey.survey_responses (created_at desc);

create index idx_responses_normalized_body
	on sg_reports_survey.survey_responses (normalized_body);

create index idx_responses_user_id
	on sg_reports_survey.survey_responses (responded_by_user_id);

create trigger update_survey_responses_updated_at
	before update
	on sg_reports_survey.survey_responses
	for each row
	execute procedure sg_reports_survey.update_updated_at_column();

grant select on sg_reports_survey.survey_responses to chat_readonly;

create table sg_reports_survey.report_frequencies
(
	proper_title text not null,
	normalized_body text default ''::text not null,
	calculated_frequency text not null,
	gap_history integer[],
	year_count integer,
	updated_at timestamp with time zone default now(),
	primary key (proper_title, normalized_body)
);

comment on table sg_reports_survey.report_frequencies is 'Pre-computed reporting frequencies using weighted mode algorithm, grouped by title and UN body';

comment on column sg_reports_survey.report_frequencies.proper_title is 'Report title for grouping';

comment on column sg_reports_survey.report_frequencies.normalized_body is 'Normalized UN body extracted from un_body field (empty string if unknown)';

comment on column sg_reports_survey.report_frequencies.calculated_frequency is 'Frequency label: annual, biennial, triennial, quadrennial, one-time, etc.';

comment on column sg_reports_survey.report_frequencies.gap_history is 'Array of year gaps between publications (most recent first)';

comment on column sg_reports_survey.report_frequencies.year_count is 'Number of distinct publication years for this report group';

create index idx_report_frequencies_frequency
	on sg_reports_survey.report_frequencies (calculated_frequency);

create index idx_report_frequencies_body
	on sg_reports_survey.report_frequencies (normalized_body);

grant select on sg_reports_survey.report_frequencies to chat_readonly;

create table sg_reports_survey.report_frequency_confirmations
(
	id serial
		primary key,
	proper_title text not null,
	normalized_body text default ''::text not null,
	frequency text not null
		constraint report_frequency_confirmations_frequency_check
			check (frequency = ANY (ARRAY['multiple-per-year'::text, 'annual'::text, 'biennial'::text, 'triennial'::text, 'quadrennial'::text, 'quinquennial'::text, 'one-time'::text, 'other'::text])),
	confirmed_by_user_id uuid not null
		references sg_reports_survey.users,
	confirmed_at timestamp with time zone default now(),
	notes text,
	unique (proper_title, normalized_body)
);

comment on table sg_reports_survey.report_frequency_confirmations is 'User-confirmed reporting frequencies - one per (report, body), latest confirmation wins';

comment on column sg_reports_survey.report_frequency_confirmations.proper_title is 'Report title for grouping';

comment on column sg_reports_survey.report_frequency_confirmations.normalized_body is 'Normalized UN body extracted from un_body field';

comment on column sg_reports_survey.report_frequency_confirmations.frequency is 'User-confirmed frequency for this report';

comment on column sg_reports_survey.report_frequency_confirmations.notes is 'Optional notes explaining the frequency determination';

create index idx_freq_confirmations_frequency
	on sg_reports_survey.report_frequency_confirmations (frequency);

create index idx_freq_confirmations_user
	on sg_reports_survey.report_frequency_confirmations (confirmed_by_user_id);

create index idx_freq_confirmations_body
	on sg_reports_survey.report_frequency_confirmations (normalized_body);

grant select on sg_reports_survey.report_frequency_confirmations to chat_readonly;

create table sg_reports_survey.ai_chat_logs
(
	id bigserial
		primary key,
	session_id text not null,
	user_id uuid
		references sg_reports_survey.users,
	interaction_index integer not null,
	user_message text not null,
	user_message_timestamp timestamp with time zone not null,
	ai_response text,
	ai_response_timestamp timestamp with time zone,
	response_complete boolean default false,
	tools_called jsonb,
	tool_results jsonb,
	total_duration_ms integer,
	llm_calls integer default 0,
	error_occurred boolean default false,
	error_message text,
	model_name text,
	created_at timestamp with time zone default now()
);

comment on table sg_reports_survey.ai_chat_logs is 'Comprehensive logging of all AI chat interactions for evaluation and analysis';

create index idx_ai_chat_logs_session
	on sg_reports_survey.ai_chat_logs (session_id);

create index idx_ai_chat_logs_user
	on sg_reports_survey.ai_chat_logs (user_id);

create index idx_ai_chat_logs_timestamp
	on sg_reports_survey.ai_chat_logs (created_at);

create index idx_ai_chat_logs_session_index
	on sg_reports_survey.ai_chat_logs (session_id, interaction_index);

