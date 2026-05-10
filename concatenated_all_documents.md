# Living SRS Builder â€” Social Trend Intelligence Backend

This document serves as a living Software Requirements Specification (SRS) and backend architecture discovery record.

The purpose of this document is not only to record decisions, but also to create a structured developer handoff package for implementation.

The system being designed is a modular backend platform responsible for:

- Collecting social media content from multiple platforms
- Extracting hashtags and metadata
- Filtering content using engagement-based thresholds
- Storing normalized analytics
- Serving processed data through APIs
- Supporting future intelligence and trend computation modules

This document evolves continuously as architectural decisions become finalized.

---

# Project Goal

Design a backend system that:

- Scrapes and analyzes social content from Instagram and LinkedIn
- Extracts hashtags and metadata
- Filters high-engagement posts
- Stores structured analytics
- Computes trends in future phases
- Serves APIs for dashboard consumption
- Supports future extensibility to additional social platforms
- Maintains modularity so future analytics layers can plug in

The backend is intended to function as a reusable analytics engine.

It is not tightly coupled to a frontend.

Instead, it acts as a backend intelligence provider.

---

# Decision Log

Each section below documents a finalized or in-progress backend decision.

The goal of this decision log is to:

- Prevent architectural ambiguity
- Create a stable implementation contract
- Provide long-term maintainability
- Help future developers understand system rationale
- Ensure consistency across modules

---

# 1. System Scope

**Status:** In Progress

### Locked Decision 1 â€” Platform Scope

Chosen: Generic social connector framework.

### Meaning

The backend will not be hardcoded only for Instagram and LinkedIn.

Instead, it will follow a platform-adapter architecture.

This ensures the system can evolve into a reusable scraping and intelligence platform.

Example:

```text
Platform Connector Interface
        â†“
Instagram Connector
LinkedIn Connector
Future Connectors
```

### Benefits

- Future-proof design
- Easy addition of new platforms
- Shared scraping pipeline
- Cleaner abstraction layer
- Reduced duplication across connectors
- Consistent extraction strategy
- Easier onboarding for new platforms

### Planned Future Extensibility

Potential future connectors:

- TikTok
- YouTube
- X (Twitter)
- Reddit
- Facebook Pages
- Pinterest

### Architecture Implication

Each platform scraper must implement a shared contract.

Example responsibilities:

- login()
- scrollFeed()
- extractPosts()
- normalizeOutput()
- collectFromFeed()
- collectFromSearch()
- interceptApiResponses()

### Connector Design Philosophy

Every platform connector behaves like an independent plugin.

This ensures:

- Connectors can fail independently
- Platform-specific logic stays isolated
- Maintenance becomes easier
- One connector changing does not affect others

---

# 2. Data Collection Strategy

**Status:** In Progress

### Locked Decision 2 â€” Discovery Model

Chosen: Hybrid discovery model.

### Meaning

The backend will support both:

1. Feed-based discovery
2. Keyword/Hashtag-based discovery

This hybrid model allows the backend to support both passive and targeted data acquisition.

---

### Feed Discovery Flow

```text
Login
â†“
Scroll feed
â†“
Collect naturally surfaced posts
```

Use case:

- Discover organically trending content
- Platform-native recommendations
- Viral discovery patterns
- Passive trend observation
- Recommendation-engine driven discovery

---

### Keyword Discovery Flow

```text
Search keyword/hashtag
â†“
Open search results
â†“
Collect matching posts
```

Use case:

- Niche trend tracking
- Industry/topic-specific analytics
- Targeted intelligence gathering
- Competitive research
- Brand or category monitoring

---

### Extraction Strategy

The backend should support dual extraction methods:

1. DOM/HTML extraction
2. API response interception

The connector may decide which method is optimal depending on platform behavior.

---

### API Interception Support

When possible, the connector may intercept platform API responses or GraphQL responses.

Benefits:

- Cleaner JSON data
- Faster extraction
- Reduced DOM dependency
- More stable metadata collection
- Lower parsing complexity
- Reduced selector fragility

---

### Locked Decision 3 â€” Normalization Layer

Chosen: Yes, use normalization layer.

### Meaning

Each platform connector converts platform-specific responses into a shared universal schema.

This normalization layer becomes the backbone of downstream processing.

---

### Example

Instagram may return:

```text
likes_count
caption
```

LinkedIn may return:

```text
reactionCount
text
```

Both are normalized into:

```json
{
  "platform": "instagram",
  "platformPostId": "abc123",
  "caption": "...",
  "likes": 12000,
  "comments": 500,
  "hashtags": []
}
```

---

### Benefits

- Universal queue payload
- Platform-independent parser
- Clean database schema
- Unified API responses
- Easier connector extensibility
- Cleaner service layer
- Easier debugging

---

### Architecture Implication

Each connector should implement:

```text
normalizeOutput(rawPlatformData)
```

The normalized object becomes the shared contract passed into downstream services.

---

### Locked Decision 4 â€” Scraping Trigger Model

Chosen: Hybrid trigger model.

### Meaning

The backend will support:

1. Scheduled scraping
2. Manual scraping triggers

This ensures the backend can run autonomously while still allowing direct intervention.

---

### Scheduled Trigger Use Cases

```text
Periodic trend collection
Automated ingestion
Continuous monitoring
```

Example:

```text
Instagram scrape every 15 minutes
LinkedIn scrape every 30 minutes
```

---

### Manual Trigger Use Cases

```text
Debugging
Connector testing
Targeted crawl
Keyword-specific collection
Forced refresh
```

---

### Architecture Implication

The system should expose a trigger interface.

Example:

```text
startScheduledJob()
startManualJob()
```

---

### Operational Benefit

- Automation remains primary
- Manual control available
- Easier maintenance
- Better observability
- Better debugging workflow
- Easier platform validation

---

# 3. Queue & Worker Design

**Status:** In Progress

### Locked Decision 5 â€” Queue Architecture

Chosen: Dedicated queue per responsibility.

---

### Queue Design

The backend will maintain multiple isolated queues.

Each queue represents a specific stage in the backend lifecycle.

This improves modularity and fault isolation.

---

### Planned Queues

```text
scrapeQueue
parseQueue
thresholdQueue
trendQueue
```

---

### Queue Responsibilities

#### scrapeQueue

Handles:

- platform connector jobs
- feed crawl jobs
- keyword crawl jobs
- scheduled scraping
- manual scraping requests

---

#### parseQueue

Handles:

- metadata extraction
- hashtag parsing
- response normalization validation
- payload cleanup
- content filtering

---

#### thresholdQueue

Handles:

- engagement filtering
- quality control
- deduplication checks
- metric validation

---

#### trendQueue

Handles:

- trend score computation
- aggregation jobs
- historical snapshots
- future intelligence workflows

---

### Benefits

- Better fault isolation
- Easier scaling
- Independent retries
- Queue-specific monitoring
- Cleaner worker ownership
- Easier debugging
- Clear system responsibilities

---

### Locked Decision 6 â€” Queue Payload Strategy

Chosen: Hybrid payload strategy.

---

### Meaning

Queues will carry:

1. Normalized lightweight payload
2. Reference to stored raw source payload

This prevents queues from becoming heavy.

---

### Queue Payload Example

```json
{
  "platform": "instagram",
  "normalizedData": {
    "platformPostId": "abc123",
    "likes": 12000,
    "comments": 500
  },
  "rawPayloadRef": "raw_12345"
}
```

---

### Raw Data Handling

Raw data is stored separately from queue.

Possible storage:

- raw_payloads table
- JSON archive
- object/blob storage

---

### Purpose

- Debugging
- Parser replay
- Recovery from schema changes
- Historical audits
- Validation testing

---

### Locked Decision 7 â€” Worker Processing Model

Chosen: Concurrent worker model.

---

### Meaning

Workers may process multiple jobs simultaneously.

Concurrency can be tuned based on queue volume.

---

### Example

```text
Parser worker concurrency = 10
```

Meaning:

One worker instance may process 10 queue jobs concurrently.

---

### Benefits

- Higher throughput
- Faster processing
- Better scaling
- Improved queue draining
- Better CPU utilization
- Reduced processing bottlenecks

---

### Architecture Implication

Each worker should support:

- concurrency limits
- retry policies
- timeout handling
- graceful failure recovery
- dead-letter handling
- logging context

---

# 4. Parser & Threshold Logic

**Status:** In Progress

### Locked Decision 8 â€” Threshold Strategy

Chosen: Database-configurable thresholds.

---

### Meaning

Threshold values will not be hardcoded.

They will be configurable through database or config layer.

This allows runtime updates.

---

### Example

```text
Instagram:
likes > 100000
comments > 5000

LinkedIn:
reactions > 5000
comments > 100
```

---

### Benefits

- Platform-specific thresholds
- Runtime updates without deployment
- Easier experimentation
- Better filtering control
- Adjustable engagement logic

---

### Architecture Implication

A dedicated threshold configuration source should exist.

Possible implementation:

```text
threshold_rules table
```

---

### Example Schema

```text
platform
metric_name
operator
threshold_value
active
```

---

### Locked Decision 9 â€” Deduplication Identity

Chosen: Platform-specific post ID.

---

### Meaning

The backend will uniquely identify posts using:

```text
platform
+
platformPostId
```

---

### Example

```text
platform = instagram
platformPostId = abc123
```

---

### Why This Was Chosen

- Stable identifier from platform
- Prevents duplicate inserts
- Cleaner than URL matching
- Safer than hash-based comparison
- Easier indexing strategy

---

### Deduplication Rule

Before DB insert:

```text
Check if (platform + platformPostId) already exists
```

If match exists:

```text
Skip insert
```

---

### Architecture Implication

A composite uniqueness constraint should exist.

Example:

```text
UNIQUE(platform, platformPostId)
```

---

# 5. Database Design

**Status:** In Progress

### Locked Decision 10 â€” Database Strategy

Chosen: Single relational database.

---

### Database Choice

Use PostgreSQL as the primary and only database.

---

### Reasoning

The system is highly relational.

Core relationships include:

```text
posts â†” hashtags â†” trend_scores â†” trend_history
```

---

### Why This Was Chosen

- Clean many-to-many modeling
- Strong query capabilities
- Easier analytics aggregation
- Reliable indexing
- Supports JSONB for semi-structured payloads
- Better transactional guarantees

---

### Data Scope

Database primarily stores:

- posts
- hashtags
- engagement metrics
- relationship mappings
- trend intelligence
- threshold configuration
- raw payload references
- processing metadata

---

### Important Clarification

Raw payloads are not the main stored entity.

Primary focus remains:

```text
Hashtags + Metrics + Relationships + Trends
```

---

### Architecture Implication

The schema should remain normalized.

Expected core tables:

```text
posts
hashtags
post_hashtags
trend_scores
trend_history
threshold_rules
```

---

### Locked Decision 11 â€” Raw Payload Storage Strategy

Chosen: Store raw payloads inside PostgreSQL using JSONB.

---

### Meaning

Raw payloads are stored in a dedicated table within PostgreSQL.

This allows:

- replaying parser logic
- debugging extraction failures
- schema evolution support
- forensic inspection of connector output

---

### Storage Strategy

Raw payloads are not the primary data entity.

They exist as temporary support data.

---

### Recommended Table

```text
raw_payloads
```

---

### Suggested Schema

```text
id
platform
payload_json (JSONB)
created_at
expires_at
source_type
```

---

### Retention Policy

Raw payloads should not be stored forever.

Recommended retention:

```text
7â€“30 days
```

After expiration:

```text
cleanup worker deletes expired payloads
```

---

### Why This Was Chosen

- Keeps architecture simple
- Avoids extra storage systems
- Supports debugging
- Preserves replay capability
- Fits V1 scale
- Avoids unnecessary infrastructure complexity

---

# 6. Trend Intelligence

**Status:** Deferred

Trend computation is intentionally postponed.

Reason:

The current scope prioritizes:

- Data collection
- Data normalization
- Storage
- API delivery

Trend intelligence remains modular.

It may be implemented later without changing earlier layers.

Potential future decisions include:

- Trend formula
- Time windows
- Aggregation intervals
- Historical scoring
- Velocity calculations

---

# 7. API Design

**Status:** In Progress

### Locked Decision 12 â€” API Style

Chosen: REST API.

---

### Meaning

The backend will expose data using RESTful endpoints.

---

### Why This Was Chosen

- Simpler backend contracts
- Easier frontend integration
- Better developer handoff
- Easier debugging and testing
- Predictable routing structure
- Strong documentation compatibility

---

### Example Endpoint Structure

```http
GET /api/posts
GET /api/hashtags
GET /api/platforms/:platform/posts
GET /api/hashtags/:id
```

---

### Planned API Categories

```text
Collection APIs
Filtering APIs
Manual Trigger APIs
Health/Monitoring APIs
Administrative APIs
```

---

### Architecture Implication

API layer should remain independent of scraping logic.

Flow:

```text
API Layer
â†“
Service Layer
â†“
Database
```

---

### Locked Decision 13 â€” API Authentication Strategy

Chosen: API Key Authentication.

---

### Meaning

Backend APIs will be protected using API keys.

Clients such as dashboard services, analytics layers, or future intelligence modules must provide a valid key.

---

### Example

```http
x-api-key: your-secret-key
```

---

### Why This Was Chosen

- Backend APIs are not intended for direct public use
- Simple integration for internal services
- Easy to secure dashboard access
- Future trend/intelligence layer can authenticate easily
- Lower complexity than full user-auth systems

---

### Architecture Implication

API gateway or middleware should validate API keys before request processing.

Flow:

```text
Request
â†“
API Key Validation Middleware
â†“
REST Endpoint
â†“
Service Layer
```

---

# 8. Infrastructure & Deployment

**Status:** Pending

Infrastructure decisions will define runtime execution.

Planned discussion areas:

- Docker strategy
- Redis usage
- Logging
- Monitoring
- Health checks
- Deployment environment
- Background worker scaling
- Queue observability

Potential stack:

- Docker containers
- Redis queue backend
- PostgreSQL database
- Node.js backend runtime
- Monitoring dashboard

---

# 9. HLD (High-Level Design)

**Status:** Pending

Will include:

- System architecture
- Service boundaries
- Data flow
- Connector lifecycle
- Queue relationships
- Worker orchestration

Expected HLD outputs:

- Component diagrams
- Backend interaction flow
- Service responsibility map
- Infrastructure layout

---

# 10. LLD (Low-Level Design)

**Status:** Pending

Will include:

- Folder structure
- Modules
- Worker lifecycle
- Parser logic
- Queue payload schema
- DTO contracts
- API request/response models
- Service interfaces

Expected LLD outputs:

- Detailed module ownership
- Internal service responsibilities
- Queue event structure
- Database repository layer
- Worker orchestration details

---

# 11. Final SRS Output

**Status:** Pending

Will include:

- Functional requirements
- Non-functional requirements
- HLD
- LLD
- Database schema
- API contracts
- Data flow diagrams
- Assumptions and constraints
- Scalability notes
- Deployment architecture
- Queue lifecycle
- Platform connector contracts
- Storage strategy
- Developer implementation notes

The final SRS will serve as a complete handoff document for backend engineers.

It should allow a development team to begin implementation with minimal ambiguity.
# 5. Database Design

**Status:** In Progress

### Locked Decision 10 â€” Database Strategy

Chosen: Single relational database.

---

### Database Choice

Use PostgreSQL as the primary and only database.

---

### Reasoning

The system is highly relational.

Core relationships include:

```text
posts â†” hashtags â†” trend_scores â†” trend_history
```

---

### Why This Was Chosen

- Clean many-to-many modeling
- Strong query capabilities
- Easier analytics aggregation
- Reliable indexing
- Supports JSONB for semi-structured payloads
- Better transactional guarantees

---

### Data Scope

Database primarily stores:

- posts
- hashtags
- engagement metrics
- relationship mappings
- trend intelligence
- threshold configuration
- raw payload references
- processing metadata

---

### Important Clarification

Raw payloads are not the main stored entity.

Primary focus remains:

```text
Hashtags + Metrics + Relationships + Trends
```

---

### Architecture Implication

The schema should remain normalized.

Expected core tables:

```text
posts
hashtags
post_hashtags
trend_scores
trend_history
threshold_rules
```

---

### Locked Decision 11 â€” Raw Payload Storage Strategy

Chosen: Store raw payloads inside PostgreSQL using JSONB.

---

### Meaning

Raw payloads are stored in a dedicated table within PostgreSQL.

This allows:

- replaying parser logic
- debugging extraction failures
- schema evolution support
- forensic inspection of connector output

---

### Storage Strategy

Raw payloads are not the primary data entity.

They exist as temporary support data.

---

### Recommended Table

```text
raw_payloads
```

---

### Suggested Schema

```text
id
platform
payload_json (JSONB)
created_at
expires_at
source_type
```

---

### Retention Policy

Raw payloads should not be stored forever.

Recommended retention:

```text
7â€“30 days
```

After expiration:

```text
cleanup worker deletes expired payloads
```

---

### Why This Was Chosen

- Keeps architecture simple
- Avoids extra storage systems
- Supports debugging
- Preserves replay capability
- Fits V1 scale
- Avoids unnecessary infrastructure complexity

---

# 6. Trend Intelligence

**Status:** Deferred

Trend computation is intentionally postponed.

Reason:

The current scope prioritizes:

- Data collection
- Data normalization
- Storage
- API delivery

Trend intelligence remains modular.

It may be implemented later without changing earlier layers.

Potential future decisions include:

- Trend formula
- Time windows
- Aggregation intervals
- Historical scoring
- Velocity calculations

---

# 7. API Design

**Status:** In Progress

### Locked Decision 12 â€” API Style

Chosen: REST API.

---

### Meaning

The backend will expose data using RESTful endpoints.

---

### Why This Was Chosen

- Simpler backend contracts
- Easier frontend integration
- Better developer handoff
- Easier debugging and testing
- Predictable routing structure
- Strong documentation compatibility

---

### Example Endpoint Structure

```http
GET /api/posts
GET /api/hashtags
GET /api/platforms/:platform/posts
GET /api/hashtags/:id
```

---

### Planned API Categories

```text
Collection APIs
Filtering APIs
Manual Trigger APIs
Health/Monitoring APIs
Administrative APIs
```

---

### Architecture Implication

API layer should remain independent of scraping logic.

Flow:

```text
API Layer
â†“
Service Layer
â†“
Database
```

---

### Locked Decision 13 â€” API Authentication Strategy

Chosen: API Key Authentication.

---

### Meaning

Backend APIs will be protected using API keys.

Clients such as dashboard services, analytics layers, or future intelligence modules must provide a valid key.

---

### Example

```http
x-api-key: your-secret-key
```

---

### Why This Was Chosen

- Backend APIs are not intended for direct public use
- Simple integration for internal services
- Easy to secure dashboard access
- Future trend/intelligence layer can authenticate easily
- Lower complexity than full user-auth systems

---

### Architecture Implication

API gateway or middleware should validate API keys before request processing.

Flow:

```text
Request
â†“
API Key Validation Middleware
â†“
REST Endpoint
â†“
Service Layer
```

---

# 8. Infrastructure & Deployment

**Status:** In Progress

### Locked Decision 14 â€” Redis Usage Scope

Chosen: Queue backend + API caching.

---

### Meaning

Redis will be used for:

1. Queue transport for BullMQ workers
2. API response caching for high-frequency dashboard queries

---

### Redis Responsibilities

#### Queue Infrastructure

Redis acts as the transport and state layer for asynchronous job processing.

Used by:

```text
scrapeQueue
parseQueue
thresholdQueue
trendQueue
```

Responsibilities:

- job scheduling
- worker communication
- retries
- delayed jobs
- failed job tracking
- dead-letter handling

---

#### API Caching

Redis will cache frequently requested API responses.

Example:

```http
GET /api/hashtags
GET /api/posts?platform=instagram
GET /api/posts/trending
```

---

### Cache Strategy

Recommended TTL:

```text
15â€“60 seconds
```

This provides:

- faster dashboard load time
- reduced PostgreSQL query pressure
- better response consistency

---

### Why Option B Was Chosen

- Redis already exists for BullMQ
- Minimal infrastructure overhead
- Dashboard APIs benefit from caching
- Avoids unnecessary complexity of full Redis responsibilities

---

### Architecture Implication

Redis becomes a shared infrastructure dependency.

Flow:

```text
API Request
â†“
Check Redis Cache
â†“
If hit â†’ return cached response
â†“
If miss â†’ query PostgreSQL
â†“
Store response in Redis
```

---

### Planned Redis Usage Boundaries

Redis will NOT initially handle:

- user sessions
- authentication state
- long-term analytics storage
- distributed locks

These may be added later if system scale requires them.

---

### Planned Infrastructure Stack

```text
Node.js Backend
â†“
BullMQ
â†“
Redis
â†“
PostgreSQL
```

---

### Infrastructure Responsibilities

The infrastructure layer will manage:

- container execution
- background workers
- queue communication
- cache lifecycle
- database connectivity
- logging and monitoring hooks

---

### Planned Infrastructure Components

```text
API Server
Worker Server
Redis
PostgreSQL
Scheduler Service
```

---

### Deployment Philosophy

Each infrastructure component should remain independently deployable.

This allows:

- scaling workers without scaling API server
- queue isolation
- safer deployments
- modular infrastructure ownership

---

# 9. HLD (High-Level Design)

**Status:** In Progress

### Locked Decision 15 â€” Service Architecture Style

Chosen: Modular Monolith with service-oriented boundaries.

---

### Meaning

The backend will deploy as a single service.

Internally, responsibilities remain separated into modules.

This allows:

- simpler deployment
- lower DevOps complexity
- strong modular ownership
- future migration to microservices

---

### Architecture Philosophy

Modules should be designed as if they were future standalone services.

This means:

- low coupling
- high cohesion
- isolated responsibility
- internal service contracts

---

### Backend Structure

```text
Backend Service
â”‚
â”œâ”€â”€ scraper module
â”œâ”€â”€ parser module
â”œâ”€â”€ queue module
â”œâ”€â”€ threshold module
â”œâ”€â”€ API module
â”œâ”€â”€ database module
â”œâ”€â”€ worker module
â”œâ”€â”€ cache module
â”œâ”€â”€ monitoring module
```

---

### Module Responsibilities

#### Scraper Module

Responsible for:

- platform connector execution
- feed scrolling
- search-based scraping
- API interception

---

#### Parser Module

Responsible for:

- extracting hashtags
- extracting metadata
- cleaning payloads
- normalization validation

---

#### Queue Module

Responsible for:

- BullMQ setup
- queue registration
- queue lifecycle
- worker communication

---

#### Threshold Module

Responsible for:

- rule lookup
- threshold validation
- engagement qualification

---

#### API Module

Responsible for:

- REST endpoints
- authentication middleware
- request validation
- response shaping

---

#### Database Module

Responsible for:

- repository access
- DB transactions
- connection pooling
- schema ownership

---

#### Worker Module

Responsible for:

- concurrent processing
- queue consumers
- retry lifecycle
- failure handling

---

#### Cache Module

Responsible for:

- Redis caching
- TTL control
- cache invalidation

---

#### Monitoring Module

Responsible for:

- logging
- metrics collection
- queue monitoring
- system observability

---

### Why This Was Chosen

- easier implementation
- avoids premature microservices
- supports future separation
- lower infrastructure cost
- easier onboarding for developers

---

### Future Migration Path

If scale increases:

```text
Today:
Single Deployable Service

Future:
Multiple Deployable Services
```

Example:

```text
scraper-service
parser-service
api-service
trend-service
```

---

### Architecture Implication

Each module should avoid direct deep dependencies.

Modules communicate through:

- service interfaces
- queue payload contracts
- DTOs
- repository abstraction

---

# 10. LLD (Low-Level Design)

**Status:** In Progress

### Locked Decision 16 â€” Module Ownership Style

Chosen: Repository ownership per module.

---

### Meaning

Each module owns its own repositories and database access layer.

Modules should not directly access tables owned by another module.

Instead, interaction occurs through:

- service interfaces
- DTO contracts
- internal module APIs

---

### Example Ownership

```text
Hashtag Module
    â†“
Hashtag Service
    â†“
Hashtag Repository
    â†“
hashtags table
```

---

### Good Practice

```text
Scraper Module
â†“
Post Service
â†“
Hashtag Service
â†“
Repository Layer
```

---

### Bad Practice

```text
Scraper Module directly modifies hashtags table
```

---

### Why This Was Chosen

- Prevents cross-module coupling
- Preserves clean ownership
- Easier refactoring
- Cleaner dependency graph
- Supports future microservice migration
- Reduces accidental schema misuse

---

### Architecture Implication

Each module should own:

- services
- repositories
- DTOs
- validators
- interfaces
- business logic

---

### Recommended Module Pattern

```text
module/
â”œâ”€â”€ controller
â”œâ”€â”€ service
â”œâ”€â”€ repository
â”œâ”€â”€ dto
â”œâ”€â”€ validator
â”œâ”€â”€ types
â”œâ”€â”€ interfaces
```

---

### Repository Access Rule

Modules may only access database tables through their owned repositories.

Cross-module communication should occur through service methods.

---

# 11. Final SRS Output

**Status:** Pending

Will include:

- Functional requirements
- Non-functional requirements
- HLD
- LLD
- Database schema
- API contracts
- Data flow diagrams
- Assumptions and constraints
- Scalability notes
- Deployment architecture
- Queue lifecycle
- Platform connector contracts
- Storage strategy
- Developer implementation notes

The final SRS will serve as a complete handoff document for backend engineers.

It should allow a development team to begin implementation with minimal ambiguity.


# 9. HLD (High-Level Design)

**Status:** In Progress

### Locked Decision 15 â€” Service Architecture Style

Chosen: Modular Monolith with service-oriented boundaries.

---

### Meaning

The backend will deploy as a single service.

Internally, responsibilities remain separated into modules.

This allows:

- simpler deployment
- lower DevOps complexity
- strong modular ownership
- future migration to microservices

---

### Architecture Philosophy

Modules should be designed as if they were future standalone services.

This means:

- low coupling
- high cohesion
- isolated responsibility
- internal service contracts

---

### Backend Structure

```text
Backend Service
â”‚
â”œâ”€â”€ scraper module
â”œâ”€â”€ parser module
â”œâ”€â”€ queue module
â”œâ”€â”€ threshold module
â”œâ”€â”€ API module
â”œâ”€â”€ database module
â”œâ”€â”€ worker module
â”œâ”€â”€ cache module
â”œâ”€â”€ monitoring module
```

---

### Module Responsibilities

#### Scraper Module

Responsible for:

- platform connector execution
- feed scrolling
- search-based scraping
- API interception

---

#### Parser Module

Responsible for:

- extracting hashtags
- extracting metadata
- cleaning payloads
- normalization validation

---

#### Queue Module

Responsible for:

- BullMQ setup
- queue registration
- queue lifecycle
- worker communication

---

#### Threshold Module

Responsible for:

- rule lookup
- threshold validation
- engagement qualification

---

#### API Module

Responsible for:

- REST endpoints
- authentication middleware
- request validation
- response shaping

---

#### Database Module

Responsible for:

- repository access
- DB transactions
- connection pooling
- schema ownership

---

#### Worker Module

Responsible for:

- concurrent processing
- queue consumers
- retry lifecycle
- failure handling

---

#### Cache Module

Responsible for:

- Redis caching
- TTL control
- cache invalidation

---

#### Monitoring Module

Responsible for:

- logging
- metrics collection
- queue monitoring
- system observability

---

### Why This Was Chosen

- easier implementation
- avoids premature microservices
- supports future separation
- lower infrastructure cost
- easier onboarding for developers

---

### Future Migration Path

If scale increases:

```text
Today:
Single Deployable Service

Future:
Multiple Deployable Services
```

Example:

```text
scraper-service
parser-service
api-service
trend-service
```

---

### Architecture Implication

Each module should avoid direct deep dependencies.

Modules communicate through:

- service interfaces
- queue payload contracts
- DTOs
- repository abstraction

---

# 10. LLD (Low-Level Design)

**Status:** In Progress

### Locked Decision 16 â€” Module Ownership Style

Chosen: Repository ownership per module.

---

### Meaning

Each module owns its own repositories and database access layer.

Modules should not directly access tables owned by another module.

Instead, interaction occurs through:

- service interfaces
- DTO contracts
- internal module APIs

---

### Example Ownership

```text
Hashtag Module
    â†“
Hashtag Service
    â†“
Hashtag Repository
    â†“
hashtags table
```

---

### Good Practice

```text
Scraper Module
â†“
Post Service
â†“
Hashtag Service
â†“
Repository Layer
```

---

### Bad Practice

```text
Scraper Module directly modifies hashtags table
```

---

### Why This Was Chosen

- Prevents cross-module coupling
- Preserves clean ownership
- Easier refactoring
- Cleaner dependency graph
- Supports future microservice migration
- Reduces accidental schema misuse

---

### Architecture Implication

Each module should own:

- services
- repositories
- DTOs
- validators
- interfaces
- business logic

---

### Recommended Module Pattern

```text
module/
â”œâ”€â”€ controller
â”œâ”€â”€ service
â”œâ”€â”€ repository
â”œâ”€â”€ dto
â”œâ”€â”€ validator
â”œâ”€â”€ types
â”œâ”€â”€ interfaces
```

---

### Repository Access Rule

Modules may only access database tables through their owned repositories.

Cross-module communication should occur through service methods.

---

### Locked Decision 17 â€” Folder Structure Strategy

Chosen: Module-first architecture.

---

### Meaning

The backend codebase will be organized by modules rather than technical layers.

This aligns directly with the modular monolith philosophy.

---

### Recommended Root Structure

```text
/src
â”‚
â”œâ”€â”€ /modules
â”œâ”€â”€ /shared
â”œâ”€â”€ /config
â”œâ”€â”€ /database
â”œâ”€â”€ /queues
â”œâ”€â”€ /workers
â”œâ”€â”€ /cache
â”œâ”€â”€ /middlewares
â”œâ”€â”€ /utils
â”œâ”€â”€ /types
â”œâ”€â”€ /constants
â”œâ”€â”€ app.ts
â”œâ”€â”€ server.ts
```

---

### Module-First Structure

```text
/modules
    /scraper
    /posts
    /hashtags
    /threshold
    /api
    /monitoring
```

Each module owns its internal logic.

---

### Recommended Module Layout

```text
module/
â”œâ”€â”€ controller
â”œâ”€â”€ service
â”œâ”€â”€ repository
â”œâ”€â”€ dto
â”œâ”€â”€ validator
â”œâ”€â”€ interfaces
â”œâ”€â”€ types
â”œâ”€â”€ queue
â”œâ”€â”€ worker
â”œâ”€â”€ constants
â”œâ”€â”€ tests
```

---

### Why This Was Chosen

- Matches modular monolith design
- Strong ownership boundaries
- Easier onboarding
- Cleaner scaling
- Easier future extraction to microservices
- Better test organization

---

### Shared Layer Purpose

The shared layer stores reusable components.

Example:

```text
/shared
â”œâ”€â”€ logger
â”œâ”€â”€ exceptions
â”œâ”€â”€ decorators
â”œâ”€â”€ helper functions
â”œâ”€â”€ shared DTOs
```

---

### Config Layer

Responsible for:

```text
Environment variables
Redis config
PostgreSQL config
Queue config
API settings
```

---

### Worker Placement Strategy

Workers may exist:

1. Inside modules for ownership
2. Inside shared worker registry

Recommended:

```text
workers stay near owning module
```

Example:

```text
/modules/parser/worker
/modules/scraper/worker
```

---

### Architecture Implication

Folder structure should reinforce ownership.

A developer should understand responsibility from path alone.

Example:

```text
/modules/hashtags/service
```

immediately indicates ownership.

---

### Locked Decision 18 â€” Queue Job Contract Strategy

Chosen: Strict DTO-based queue contracts.

---

### Meaning

Every queue payload must follow a strict and versioned schema.

Queues should behave like internal APIs.

Workers should never receive loosely structured payloads.

---

### Queue Contract Philosophy

Queue messages become a communication contract between modules.

This ensures:

- predictable processing
- safer worker ownership
- reduced parsing ambiguity
- easier debugging
- version-safe payload evolution

---

### Recommended Base Queue Contract

```json
{
  "jobId": "uuid",
  "jobType": "SCRAPE_POSTS",
  "platform": "instagram",
  "source": "feed",
  "payloadRef": "payload_123",
  "metadata": {
    "trigger": "scheduler",
    "attempt": 1
  },
  "createdAt": "timestamp"
}
```

---

### Required Queue Fields

```text
jobId
jobType
platform
source
payloadRef
createdAt
metadata
```

---

### Queue Payload Versioning

Recommended:

```text
schemaVersion
```

Example:

```json
{
  "schemaVersion": "v1"
}
```

This protects future compatibility.

---

### Why This Was Chosen

- Strong worker contracts
- Easier debugging
- Safer queue evolution
- Cleaner queue monitoring
- Prevents malformed jobs
- Supports future scaling

---

### Architecture Implication

Every queue should have:

- DTO validator
- payload parser
- schema validator
- retry-safe deserialization

---

### Queue Ownership

Each module owns its queue payload contract.

Example:

```text
scraper module
    â†“
scrape.dto.ts
```

---

### Queue Validation Rule

Jobs must be validated before entering queue.

Flow:

```text
Create DTO
â†“
Validate
â†“
Push to Queue
```

---

### Locked Decision 19 â€” API Response Strategy

Chosen: Structured response envelope.

---

### Meaning

All REST APIs must return responses using a consistent response wrapper.

This ensures predictable contracts for dashboard consumers and future internal services.

---

### Standard Success Response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "count": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload"
  }
}
```

---

### Why This Was Chosen

- Predictable frontend integration
- Cleaner pagination handling
- Consistent error contracts
- Easier API documentation
- Better monitoring and logging
- Reduced dashboard parsing complexity

---

### Required Response Sections

```text
success
data
meta
error
```

---

### API Contract Rule

All endpoints must follow the same response format.

This includes:

- collection endpoints
- detail endpoints
- health endpoints
- admin endpoints
- manual trigger endpoints

---

### Architecture Implication

A shared response builder utility should exist.

Example:

```text
/shared/response-builder
```

---

### Example Utility

```text
successResponse(data, meta)
errorResponse(code, message)
```

---

### Locked Decision 20 â€” Pagination Strategy

Chosen: Cursor-based pagination.

---

### Meaning

All collection-based endpoints will use cursor pagination instead of offset pagination.

This improves performance and consistency for continuously growing datasets.

---

### Example Endpoint

```http
GET /api/posts?cursor=abc123&limit=20
```

---

### Example Response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "nextCursor": "xyz456",
    "limit": 20
  }
}
```

---

### Why This Was Chosen

- Better scalability
- Faster query performance
- Avoids duplicate records
- Safer for live datasets
- Better for dashboard scrolling

---

### Cursor Source

Cursor may be generated from:

```text
created_at timestamp
or
unique ID ordering
```

---

### Architecture Implication

Endpoints should support:

- nextCursor
- limit
- ordering consistency

---

### Locked Decision 21 â€” API Filtering Strategy

Chosen: Query-parameter filtering.

---

### Meaning

Endpoints support filtering through query parameters.

This avoids endpoint explosion.

---

### Example

```http
GET /api/posts?platform=instagram&minLikes=10000&from=2026-04-01
```

---

### Supported Filter Types

```text
platform
minLikes
minComments
hashtag
fromDate
toDate
source
thresholdQualified
```

---

### Why This Was Chosen

- Flexible dashboard integration
- Reduced endpoint count
- Easier backend maintenance
- Better composability
- Cleaner REST design

---

### Architecture Implication

A centralized filter parser should exist.

Example:

```text
/shared/filter-parser
```

---

### Filter Processing Flow

```text
Incoming Query Params
â†“
Validation Layer
â†“
Filter Builder
â†“
Repository Query
```

---

### Recommended Validation

Each filter should validate:

- type
- allowed values
- operator safety
- date range correctness

---

# 11. Final SRS Output

**Status:** Pending

Will include:

- Functional requirements
- Non-functional requirements
- HLD
- LLD
- Database schema
- API contracts
- Data flow diagrams
- Assumptions and constraints
- Scalability notes
- Deployment architecture
- Queue lifecycle
- Platform connector contracts
- Storage strategy
- Developer implementation notes

The final SRS will serve as a complete handoff document for backend engineers.

It should allow a development team to begin implementation with minimal ambiguity.


# 9. HLD (High-Level Design)

**Status:** In Progress

### Locked Decision 15 â€” Service Architecture Style

Chosen: Modular Monolith with service-oriented boundaries.

---

### Meaning

The backend will deploy as a single service.

Internally, responsibilities remain separated into modules.

This allows:

- simpler deployment
- lower DevOps complexity
- strong modular ownership
- future migration to microservices

---

### Architecture Philosophy

Modules should be designed as if they were future standalone services.

This means:

- low coupling
- high cohesion
- isolated responsibility
- internal service contracts

---

### Backend Structure

```text
Backend Service
â”‚
â”œâ”€â”€ scraper module
â”œâ”€â”€ parser module
â”œâ”€â”€ queue module
â”œâ”€â”€ threshold module
â”œâ”€â”€ API module
â”œâ”€â”€ database module
â”œâ”€â”€ worker module
â”œâ”€â”€ cache module
â”œâ”€â”€ monitoring module
```

---

### Module Responsibilities

#### Scraper Module

Responsible for:

- platform connector execution
- feed scrolling
- search-based scraping
- API interception

---

#### Parser Module

Responsible for:

- extracting hashtags
- extracting metadata
- cleaning payloads
- normalization validation

---

#### Queue Module

Responsible for:

- BullMQ setup
- queue registration
- queue lifecycle
- worker communication

---

#### Threshold Module

Responsible for:

- rule lookup
- threshold validation
- engagement qualification

---

#### API Module

Responsible for:

- REST endpoints
- authentication middleware
- request validation
- response shaping

---

#### Database Module

Responsible for:

- repository access
- DB transactions
- connection pooling
- schema ownership

---

#### Worker Module

Responsible for:

- concurrent processing
- queue consumers
- retry lifecycle
- failure handling

---

#### Cache Module

Responsible for:

- Redis caching
- TTL control
- cache invalidation

---

#### Monitoring Module

Responsible for:

- logging
- metrics collection
- queue monitoring
- system observability

---

### Why This Was Chosen

- easier implementation
- avoids premature microservices
- supports future separation
- lower infrastructure cost
- easier onboarding for developers

---

### Future Migration Path

If scale increases:

```text
Today:
Single Deployable Service

Future:
Multiple Deployable Services
```

Example:

```text
scraper-service
parser-service
api-service
trend-service
```

---

### Architecture Implication

Each module should avoid direct deep dependencies.

Modules communicate through:

- service interfaces
- queue payload contracts
- DTOs
- repository abstraction

---

# 10. LLD (Low-Level Design)

**Status:** In Progress

### Locked Decision 16 â€” Module Ownership Style

Chosen: Repository ownership per module.

---

### Meaning

Each module owns its own repositories and database access layer.

Modules should not directly access tables owned by another module.

Instead, interaction occurs through:

- service interfaces
- DTO contracts
- internal module APIs

---

### Example Ownership

```text
Hashtag Module
    â†“
Hashtag Service
    â†“
Hashtag Repository
    â†“
hashtags table
```

---

### Good Practice

```text
Scraper Module
â†“
Post Service
â†“
Hashtag Service
â†“
Repository Layer
```

---

### Bad Practice

```text
Scraper Module directly modifies hashtags table
```

---

### Why This Was Chosen

- Prevents cross-module coupling
- Preserves clean ownership
- Easier refactoring
- Cleaner dependency graph
- Supports future microservice migration
- Reduces accidental schema misuse

---

### Architecture Implication

Each module should own:

- services
- repositories
- DTOs
- validators
- interfaces
- business logic

---

### Recommended Module Pattern

```text
module/
â”œâ”€â”€ controller
â”œâ”€â”€ service
â”œâ”€â”€ repository
â”œâ”€â”€ dto
â”œâ”€â”€ validator
â”œâ”€â”€ types
â”œâ”€â”€ interfaces
```

---

### Repository Access Rule

Modules may only access database tables through their owned repositories.

Cross-module communication should occur through service methods.

---

### Locked Decision 17 â€” Folder Structure Strategy

Chosen: Module-first architecture.

---

### Meaning

The backend codebase will be organized by modules rather than technical layers.

This aligns directly with the modular monolith philosophy.

---

### Recommended Root Structure

```text
/src
â”‚
â”œâ”€â”€ /modules
â”œâ”€â”€ /shared
â”œâ”€â”€ /config
â”œâ”€â”€ /database
â”œâ”€â”€ /queues
â”œâ”€â”€ /workers
â”œâ”€â”€ /cache
â”œâ”€â”€ /middlewares
â”œâ”€â”€ /utils
â”œâ”€â”€ /types
â”œâ”€â”€ /constants
â”œâ”€â”€ app.ts
â”œâ”€â”€ server.ts
```

---

### Module-First Structure

```text
/modules
    /scraper
    /posts
    /hashtags
    /threshold
    /api
    /monitoring
```

Each module owns its internal logic.

---

### Recommended Module Layout

```text
module/
â”œâ”€â”€ controller
â”œâ”€â”€ service
â”œâ”€â”€ repository
â”œâ”€â”€ dto
â”œâ”€â”€ validator
â”œâ”€â”€ interfaces
â”œâ”€â”€ types
â”œâ”€â”€ queue
â”œâ”€â”€ worker
â”œâ”€â”€ constants
â”œâ”€â”€ tests
```

---

### Why This Was Chosen

- Matches modular monolith design
- Strong ownership boundaries
- Easier onboarding
- Cleaner scaling
- Easier future extraction to microservices
- Better test organization

---

### Shared Layer Purpose

The shared layer stores reusable components.

Example:

```text
/shared
â”œâ”€â”€ logger
â”œâ”€â”€ exceptions
â”œâ”€â”€ decorators
â”œâ”€â”€ helper functions
â”œâ”€â”€ shared DTOs
```

---

### Config Layer

Responsible for:

```text
Environment variables
Redis config
PostgreSQL config
Queue config
API settings
```

---

### Worker Placement Strategy

Workers may exist:

1. Inside modules for ownership
2. Inside shared worker registry

Recommended:

```text
workers stay near owning module
```

Example:

```text
/modules/parser/worker
/modules/scraper/worker
```

---

### Architecture Implication

Folder structure should reinforce ownership.

A developer should understand responsibility from path alone.

Example:

```text
/modules/hashtags/service
```

immediately indicates ownership.

---

### Locked Decision 18 â€” Queue Job Contract Strategy

Chosen: Strict DTO-based queue contracts.

---

### Meaning

Every queue payload must follow a strict and versioned schema.

Queues should behave like internal APIs.

Workers should never receive loosely structured payloads.

---

### Queue Contract Philosophy

Queue messages become a communication contract between modules.

This ensures:

- predictable processing
- safer worker ownership
- reduced parsing ambiguity
- easier debugging
- version-safe payload evolution

---

### Recommended Base Queue Contract

```json
{
  "jobId": "uuid",
  "jobType": "SCRAPE_POSTS",
  "platform": "instagram",
  "source": "feed",
  "payloadRef": "payload_123",
  "metadata": {
    "trigger": "scheduler",
    "attempt": 1
  },
  "createdAt": "timestamp"
}
```

---

### Required Queue Fields

```text
jobId
jobType
platform
source
payloadRef
createdAt
metadata
```

---

### Queue Payload Versioning

Recommended:

```text
schemaVersion
```

Example:

```json
{
  "schemaVersion": "v1"
}
```

This protects future compatibility.

---

### Why This Was Chosen

- Strong worker contracts
- Easier debugging
- Safer queue evolution
- Cleaner queue monitoring
- Prevents malformed jobs
- Supports future scaling

---

### Architecture Implication

Every queue should have:

- DTO validator
- payload parser
- schema validator
- retry-safe deserialization

---

### Queue Ownership

Each module owns its queue payload contract.

Example:

```text
scraper module
    â†“
scrape.dto.ts
```

---

### Queue Validation Rule

Jobs must be validated before entering queue.

Flow:

```text
Create DTO
â†“
Validate
â†“
Push to Queue
```

---

### Locked Decision 19 â€” API Response Strategy

Chosen: Structured response envelope.

---

### Meaning

All REST APIs must return responses using a consistent response wrapper.

This ensures predictable contracts for dashboard consumers and future internal services.

---

### Standard Success Response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "count": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload"
  }
}
```

---

### Why This Was Chosen

- Predictable frontend integration
- Cleaner pagination handling
- Consistent error contracts
- Easier API documentation
- Better monitoring and logging
- Reduced dashboard parsing complexity

---

### Required Response Sections

```text
success
data
meta
error
```

---

### API Contract Rule

All endpoints must follow the same response format.

This includes:

- collection endpoints
- detail endpoints
- health endpoints
- admin endpoints
- manual trigger endpoints

---

### Architecture Implication

A shared response builder utility should exist.

Example:

```text
/shared/response-builder
```

---

### Example Utility

```text
successResponse(data, meta)
errorResponse(code, message)
```

---

### Locked Decision 20 â€” Pagination Strategy

Chosen: Cursor-based pagination.

---

### Meaning

All collection-based endpoints will use cursor pagination instead of offset pagination.

This improves performance and consistency for continuously growing datasets.

---

### Example Endpoint

```http
GET /api/posts?cursor=abc123&limit=20
```

---

### Example Response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "nextCursor": "xyz456",
    "limit": 20
  }
}
```

---

### Why This Was Chosen

- Better scalability
- Faster query performance
- Avoids duplicate records
- Safer for live datasets
- Better for dashboard scrolling

---

### Cursor Source

Cursor may be generated from:

```text
created_at timestamp
or
unique ID ordering
```

---

### Architecture Implication

Endpoints should support:

- nextCursor
- limit
- ordering consistency

---

### Locked Decision 21 â€” API Filtering Strategy

Chosen: Query-parameter filtering.

---

### Meaning

Endpoints support filtering through query parameters.

This avoids endpoint explosion.

---

### Example

```http
GET /api/posts?platform=instagram&minLikes=10000&from=2026-04-01
```

---

### Supported Filter Types

```text
platform
minLikes
minComments
hashtag
fromDate
toDate
source
thresholdQualified
```

---

### Why This Was Chosen

- Flexible dashboard integration
- Reduced endpoint count
- Easier backend maintenance
- Better composability
- Cleaner REST design

---

### Architecture Implication

A centralized filter parser should exist.

Example:

```text
/shared/filter-parser
```

---

### Filter Processing Flow

```text
Incoming Query Params
â†“
Validation Layer
â†“
Filter Builder
â†“
Repository Query
```

---

### Recommended Validation

Each filter should validate:

- type
- allowed values
- operator safety
- date range correctness

---

### Locked Decision 22 â€” API Versioning Strategy

Chosen: URL-based versioning.

---

### Meaning

All APIs should include explicit versioning in the route path.

This ensures backward compatibility and safe API evolution.

---

### Example

```http
GET /api/v1/posts
GET /api/v1/hashtags
GET /api/v1/platforms/instagram/posts
```

---

### Why This Was Chosen

- Easier frontend compatibility
- Cleaner documentation
- Supports future API generations
- Safer rollout of breaking changes
- Predictable routing structure

---

### Future Expansion

Possible future versions:

```text
v1 â†’ ingestion + dashboard
v2 â†’ intelligence layer
v3 â†’ external integrations
```

---

### Architecture Implication

Versioning should be handled at router level.

Recommended structure:

```text
/routes
    /v1
        posts.routes.ts
        hashtags.routes.ts
```

---

### API Stability Rule

Breaking changes must create a new API version.

Non-breaking changes may remain within same version.

---

### Locked Decision 23 â€” Error Handling Architecture

Chosen: Centralized error handling layer.

---

### Meaning

Errors should not be handled independently across modules.

Each layer may catch errors locally when necessary, but all final error formatting and API exposure must go through a global error handler.

---

### Error Flow

```text
Controller / Service / Worker
â†“
Throw Error
â†“
Global Error Middleware
â†“
Standard Error Response
```

---

### Why This Was Chosen

- Consistent API error responses
- Cleaner debugging workflow
- Reduced duplicate error logic
- Easier monitoring integration
- Centralized logging
- Cleaner codebase

---

### Standard Error Categories

Recommended categories:

```text
ValidationError
AuthenticationError
AuthorizationError
DatabaseError
QueueError
ExternalServiceError
UnknownSystemError
```

---

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {}
  }
}
```

---

### Architecture Implication

A shared error layer should exist.

Recommended location:

```text
/shared/errors
```

---

### Recommended Shared Components

```text
BaseAppError
ErrorCodes
ErrorMiddleware
ErrorFactory
```

---

### Error Logging Rule

Errors should be logged before response delivery.

Recommended flow:

```text
Catch Error
â†“
Attach Context
â†“
Log
â†“
Send Response
```

---

### Worker Error Handling

Queue workers should:

- retry transient failures
- send permanent failures to dead-letter queue
- attach metadata for debugging

---

### Architecture Benefit

Centralized handling creates a predictable backend failure model.

This becomes especially important as modules grow.

---

# 11. Final SRS Output

**Status:** Pending

Will include:

- Functional requirements
- Non-functional requirements
- HLD
- LLD
- Database schema
- API contracts
- Data flow diagrams
- Assumptions and constraints
- Scalability notes
- Deployment architecture
- Queue lifecycle
- Platform connector contracts
- Storage strategy
- Developer implementation notes

The final SRS will serve as a complete handoff document for backend engineers.

It should allow a development team to begin implementation with minimal ambiguity.


### Locked Decision 21 â€” API Filtering Strategy

Chosen: Query-parameter filtering.

---

### Meaning

Endpoints support filtering through query parameters.

This avoids endpoint explosion.

---

### Example

```http
GET /api/posts?platform=instagram&minLikes=10000&from=2026-04-01
```

---

### Supported Filter Types

```text
platform
minLikes
minComments
hashtag
fromDate
toDate
source
thresholdQualified
```

---

### Why This Was Chosen

- Flexible dashboard integration
- Reduced endpoint count
- Easier backend maintenance
- Better composability
- Cleaner REST design

---

### Architecture Implication

A centralized filter parser should exist.

Example:

```text
/shared/filter-parser
```

---

### Filter Processing Flow

```text
Incoming Query Params
â†“
Validation Layer
â†“
Filter Builder
â†“
Repository Query
```

---

### Recommended Validation

Each filter should validate:

- type
- allowed values
- operator safety
- date range correctness

---

### Locked Decision 22 â€” API Versioning Strategy

Chosen: URL-based versioning.

---

### Meaning

All APIs should include explicit versioning in the route path.

This ensures backward compatibility and safe API evolution.

---

### Example

```http
GET /api/v1/posts
GET /api/v1/hashtags
GET /api/v1/platforms/instagram/posts
```

---

### Why This Was Chosen

- Easier frontend compatibility
- Cleaner documentation
- Supports future API generations
- Safer rollout of breaking changes
- Predictable routing structure

---

### Future Expansion

Possible future versions:

```text
v1 â†’ ingestion + dashboard
v2 â†’ intelligence layer
v3 â†’ external integrations
```

---

### Architecture Implication

Versioning should be handled at router level.

Recommended structure:

```text
/routes
    /v1
        posts.routes.ts
        hashtags.routes.ts
```

---

### API Stability Rule

Breaking changes must create a new API version.

Non-breaking changes may remain within same version.

---

### Locked Decision 23 â€” Error Handling Architecture

Chosen: Centralized error handling layer.

---

### Meaning

Errors should not be handled independently across modules.

Each layer may catch errors locally when necessary, but all final error formatting and API exposure must go through a global error handler.

---

### Error Flow

```text
Controller / Service / Worker
â†“
Throw Error
â†“
Global Error Middleware
â†“
Standard Error Response
```

---

### Why This Was Chosen

- Consistent API error responses
- Cleaner debugging workflow
- Reduced duplicate error logic
- Easier monitoring integration
- Centralized logging
- Cleaner codebase

---

### Standard Error Categories

Recommended categories:

```text
ValidationError
AuthenticationError
AuthorizationError
DatabaseError
QueueError
ExternalServiceError
UnknownSystemError
```

---

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {}
  }
}
```

---

### Architecture Implication

A shared error layer should exist.

Recommended location:

```text
/shared/errors
```

---

### Recommended Shared Components

```text
BaseAppError
ErrorCodes
ErrorMiddleware
ErrorFactory
```

---

### Error Logging Rule

Errors should be logged before response delivery.

Recommended flow:

```text
Catch Error
â†“
Attach Context
â†“
Log
â†“
Send Response
```

---

### Worker Error Handling

Queue workers should:

- retry transient failures
- send permanent failures to dead-letter queue
- attach metadata for debugging

---

### Locked Decision 24 â€” Logging Strategy

Chosen: Structured logging layer.

---

### Meaning

The backend will use structured logging instead of simple console logs.

Logs should be machine-readable and context-rich.

---

### Example Log Structure

```json
{
  "module": "parser",
  "jobId": "123",
  "event": "parse_success",
  "timestamp": "2026-04-27T12:00:00Z"
}
```

---

### Why This Was Chosen

- Easier debugging
- Better worker tracing
- Cleaner monitoring
- Easier log aggregation
- Better production visibility

---

### Recommended Logged Fields

```text
timestamp
module
event
jobId
platform
status
duration
error
```

---

### Architecture Implication

A shared logger utility should exist.

Recommended location:

```text
/shared/logger
```

---

### Logging Scope

Logs should exist for:

- API requests
- queue jobs
- scraping lifecycle
- parser lifecycle
- threshold decisions
- database inserts
- worker failures
- retries

---

### Logging Philosophy

Logs should help reconstruct system events.

This enables:

- replay debugging
- incident analysis
- worker tracing
- queue inspection


---

### Locked Decision 25 â€” Health Check & Monitoring Strategy

Chosen: Hybrid health monitoring (basic + deep health endpoints).

---

### Meaning

The backend exposes both:

1. Lightweight health endpoint
2. Deep dependency health endpoint

This allows quick uptime checks while also supporting infrastructure diagnostics.

---

### Basic Health Endpoint

Used for:

- uptime checks
- load balancer validation
- container liveness checks

Example:

```http
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

---

### Deep Health Endpoint

Used for:

- infrastructure validation
- debugging
- monitoring systems
- dependency visibility

Example:

```http
GET /api/v1/health
```

Response:

```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "queues": "running"
  }
}
```

---

### Why This Was Chosen

- Supports both lightweight and deep monitoring
- Better Docker/container readiness checks
- Easier production debugging
- Improves observability
- Supports deployment automation

---

### Architecture Implication

Health module should exist.

Recommended location:

```text
/modules/health
```

---

### Health Checks Should Validate

```text
PostgreSQL connectivity
Redis connectivity
Queue health
Worker heartbeat
API availability
```

---

### Monitoring Philosophy

Health endpoints should represent actual system state.

They should not only confirm API availability.


---

### Locked Decision 26 â€” Retry Strategy For Failed Jobs

Chosen: Exponential backoff retry with retry cap.

---

### Meaning

Failed queue jobs should retry automatically using exponential backoff.

Retries are limited to avoid wasting infrastructure resources on stale or low-value jobs.

---

### Retry Rule

Maximum retries:

```text
4 attempts
```

After maximum retries:

```text
job marked as permanently failed
```

---

### Retry Philosophy

The system prioritizes fresh social content.

A failed job should not block the queue indefinitely.

Since posts are time-sensitive:

- limited retry prevents queue congestion
- stale jobs do not accumulate
- worker throughput remains healthy

---

### Example Retry Schedule

```text
Attempt 1 â†’ Immediate
Attempt 2 â†’ 10 sec
Attempt 3 â†’ 30 sec
Attempt 4 â†’ 60 sec
```

---

### Why This Was Chosen

- Scraping failures are often temporary
- Protects queue stability
- Avoids repeated platform requests
- Prevents backlog accumulation
- Preserves worker efficiency

---

### Architecture Implication

Retry policy should be queue-configurable.

Example:

```text
queueOptions.retryStrategy
```

---

### Worker Failure Lifecycle

```text
Job Failed
â†“
Retry Decision
â†“
Backoff Delay
â†“
Retry
â†“
Success OR Dead Letter Queue
```

---

### Dead Letter Queue Rule

Permanent failures should move into:

```text
deadLetterQueue
```

This allows:

- debugging
- replay analysis
- failure monitoring

---

### Recommended Failure Metadata

```text
jobId
platform
errorCode
attemptCount
failedAt
module
```

---

### Operational Philosophy

Retries should optimize throughput rather than perfection.

Fresh data is prioritized over infinite recovery attempts.


---

### Locked Decision 27 â€” Scraper Rate Limiting Strategy

Chosen: Adaptive throttling.

---

### Meaning

Scraper execution speed should adjust dynamically based on platform behavior.

This avoids rigid request timing and allows the system to respond intelligently to rate limits, slowdowns, or platform defense mechanisms.

---

### Adaptive Philosophy

Rate limiting behavior should remain configurable.

Initial implementation may use conservative defaults.

Over time, throttling can evolve based on observed platform responses.

---

### Example Behavior

```text
Healthy scraping â†’ normal speed
High failures â†’ slow down
Rate-limit detection â†’ cooldown period
Low queue pressure â†’ gradual acceleration
```

---

### Why This Was Chosen

- Instagram and LinkedIn behavior may vary
- Platform defenses evolve over time
- Avoids fixed timing rigidity
- Reduces risk of bans or throttling
- Improves long-term scraping stability

---

### Architecture Implication

Rate limiting should exist as a shared utility.

Recommended location:

```text
/shared/throttler
```

---

### Recommended Inputs

Adaptive throttler may observe:

```text
request failures
captcha triggers
response latency
login failures
HTTP response status
queue backlog
```

---

### Recommended Controls

```text
base delay
max delay
cooldown duration
backoff multiplier
platform-specific rules
```

---

### Platform Awareness

Each connector may override throttling rules.

Example:

```text
Instagram â†’ aggressive cooldown
LinkedIn â†’ slower sustained pacing
```

---

### Operational Philosophy

Scraper speed should prioritize long-term survivability over short-term speed.



---

### Locked Decision 28 â€” Scraper Session Strategy

Chosen: Hybrid session persistence.

---

### Meaning

Scrapers will maintain persistent authenticated sessions while also supporting forced session refresh.

This balances stability with recovery from expired or invalid sessions.

---

### Session Philosophy

The scraper should avoid logging in on every run.

Instead:

- reuse valid session state
- refresh only when required
- periodically rotate authentication

---

### Session Flow

```text
Start Scraper
â†“
Load Stored Session
â†“
Validate Session
â†“
If Valid â†’ Continue
â†“
If Invalid â†’ Re-login
â†“
Persist Updated Session
```

---

### Why This Was Chosen

- Reduces repeated login activity
- Lowers platform detection risk
- Improves scraper performance
- Provides automatic recovery
- Prevents login bottlenecks

---

### Recommended Storage

Session persistence may include:

```text
cookies
localStorage
auth tokens
browser context state
```

---

### Recommended Session Storage Location

```text
/session-store
```

or

```text
shared/session-manager
```

---

### Session Refresh Rules

Recommended triggers:

```text
session expired
unauthorized response
login redirect detected
captcha spike
scheduled refresh interval
```

---

### Platform Awareness

Each platform connector may maintain separate session lifecycle rules.

Example:

```text
Instagram â†’ shorter session lifespan
LinkedIn â†’ persistent browser session
```

---

### Architecture Implication

A shared session manager should exist.

Responsibilities:

- load session
- validate session
- refresh session
- persist session
- rotate session

---

### Operational Philosophy

Session reuse improves stability.

Controlled refresh protects against long-lived invalid authentication states.

### Locked Decision 28 â€” Scraper Session Strategy

Chosen: Hybrid session persistence.

---

### Meaning

Scrapers will maintain persistent authenticated sessions while also supporting forced session refresh.

This balances stability with recovery from expired or invalid sessions.

---

### Session Philosophy

The scraper should avoid logging in on every run.

Instead:

- reuse valid session state
- refresh only when required
- periodically rotate authentication

---

### Session Flow

```text
Start Scraper
â†“
Load Stored Session
â†“
Validate Session
â†“
If Valid â†’ Continue
â†“
If Invalid â†’ Re-login
â†“
Persist Updated Session
```

---

### Why This Was Chosen

- Reduces repeated login activity
- Lowers platform detection risk
- Improves scraper performance
- Provides automatic recovery
- Prevents login bottlenecks

---

### Recommended Storage

Session persistence may include:

```text
cookies
localStorage
auth tokens
browser context state
```

---

### Recommended Session Storage Location

```text
/session-store
```

or

```text
shared/session-manager
```

---

### Session Refresh Rules

Recommended triggers:

```text
session expired
unauthorized response
login redirect detected
captcha spike
scheduled refresh interval
```

---

### Platform Awareness

Each platform connector may maintain separate session lifecycle rules.

Example:

```text
Instagram â†’ shorter session lifespan
LinkedIn â†’ persistent browser session
```

---

### Architecture Implication

A shared session manager should exist.

Responsibilities:

- load session
- validate session
- refresh session
- persist session
- rotate session

---

### Operational Philosophy

Session reuse improves stability.

Controlled refresh protects against long-lived invalid authentication states.


---

### Locked Decision 29 â€” Browser Automation Strategy

Chosen: Browser pool.

---

### Meaning

The system will maintain a pool of reusable browser instances.

Workers borrow a browser instance for scraping tasks and release it back into the pool after completion.

---

### Browser Pool Philosophy

Opening a fresh browser for every job is expensive.

A reusable pool improves:

- startup performance
- memory efficiency
- worker throughput
- platform stability

---

### Browser Lifecycle

```text
Worker Requests Browser
â†“
Pool Assigns Browser
â†“
Scraping Task Executes
â†“
Browser Reset/Cleanup
â†“
Return Browser To Pool
```

---

### Why This Was Chosen

- Faster scraping execution
- Lower RAM overhead
- Better concurrency handling
- Reduced browser launch cost
- Better worker scalability

---

### Recommended Pool Controls

```text
max browsers
idle timeout
max tabs per browser
browser reset interval
platform isolation rules
```

---

### Recommended Architecture Location

```text
/shared/browser-pool
```

---

### Pool Management Rules

Recommended controls:

```text
limit concurrent browser usage
cleanup stale browser sessions
restart unhealthy instances
track browser utilization
```

---

### Platform Awareness

Separate browser pools may exist per platform.

Example:

```text
Instagram Pool
LinkedIn Pool
```

This allows:

- isolated cookies
- isolated sessions
- independent throttling

---

### Operational Philosophy

Browsers should behave as reusable infrastructure resources.

Workers consume browser capacity rather than launching unmanaged instances.

---

### Locked Decision 30 â€” Scraper Isolation Strategy

Chosen: Isolated browser context per job.

---

### Meaning

Each scraping job receives its own isolated browser context while still using a shared browser instance from the pool.

This provides session separation without requiring a completely separate browser process.

---

### Isolation Philosophy

Jobs should not share cookies, storage, or authentication state directly.

Isolation prevents accidental leakage between scraping tasks.

---

### Context Lifecycle

```text
Worker Gets Browser
â†“
Create New Context
â†“
Run Scraper Job
â†“
Close Context
â†“
Return Browser To Pool
```

---

### Why This Was Chosen

- Prevents cookie contamination
- Avoids session leakage
- Improves worker safety
- Reduces platform detection risk
- Maintains browser pool efficiency

---

### Recommended Isolation Rules

```text
new context per job
clear storage after completion
isolated cookies
isolated localStorage
separate request headers
```

---

### Recommended Architecture Location

```text
/shared/browser-context-manager
```

---

### Platform Awareness

Each platform connector may apply custom context initialization.

Example:

```text
Instagram â†’ mobile-like context
LinkedIn â†’ desktop context
```

---

### Architecture Implication

Isolation should happen at context level rather than browser-process level.

This balances:

- safety
- memory efficiency
- concurrency
- session cleanliness

---

### Operational Philosophy

Contexts behave as disposable execution environments.

The browser remains reusable while execution state stays isolated.
### Locked Decision 31 â€” Scraper Trigger Strategy

Chosen: Hybrid trigger model.

---

### Meaning

Scraping can be initiated through multiple trigger mechanisms.

The backend supports:

- scheduled scraping
- manual trigger
- future event-based trigger expansion

---

### Trigger Philosophy

The scraping system should not rely on a single initiation method.

Different operational needs require different trigger styles.

---

### Supported Trigger Types

#### Scheduled Trigger

Used for automated recurring scraping.

Examples:

```text
Every 15 minutes
Every 1 hour
Daily collection
```

---

#### Manual Trigger

Used for:

- admin testing
- debugging
- targeted scrape execution
- platform validation

Example:

```http
POST /api/v1/scraper/run
```

---

#### Future Event Trigger

Potential future use:

```text
new hashtag detected
threshold spike
external webhook
platform alert
```

---

### Why This Was Chosen

- Flexible operation model
- Supports testing and debugging
- Enables automation
- Future-ready for intelligence layer
- Better operational control

---

### Recommended Architecture Location

```text
/modules/scraper/triggers
```

---

### Trigger Flow

```text
Trigger Fired
â†“
Trigger Validator
â†“
Queue Job Created
â†“
Worker Picks Job
â†“
Scraper Executes
```

---

### Recommended Trigger Metadata

```text
triggerType
initiatedBy
platform
timestamp
priority
```

---

### Architecture Implication

Trigger management should be separated from scraper execution.

Triggers decide *when* scraping begins.

Scrapers decide *how* scraping executes.

---

### Operational Philosophy

Triggering should remain flexible.

Execution logic should stay independent from scheduling logic.


---

### Locked Decision 32 â€” Scraper Target Strategy

Chosen: Hybrid targeting model.

---

### Meaning

The scraper system supports multiple discovery paths for collecting social content.

Targets are configurable and not restricted to a single platform entry point.

---

### Supported Target Types

#### Profile-Based Scraping

Used for:

- creator monitoring
- competitor tracking
- niche influencer analysis

Example:

```text
Specific Instagram accounts
Specific LinkedIn creators
```

---

#### Feed-Based Scraping

Used for:

- trending discovery
- recommendation feed mining
- explore page extraction

Example:

```text
Instagram feed
Explore feed
LinkedIn homepage feed
```

---

#### Keyword / Hashtag Discovery

Used for:

- trend discovery
- category tracking
- hashtag intelligence

Example:

```text
#AI
#startup
#fitness
```

---

### Why This Was Chosen

- Supports multiple discovery strategies
- Avoids platform dependency
- Enables future trend intelligence
- Better dataset diversity
- Flexible scraper configuration

---

### Recommended Architecture Location

```text
/modules/scraper/targets
```

---

### Target Resolution Flow

```text
Trigger Fired
â†“
Target Resolver
â†“
Determine Target Type
â†“
Queue Job Created
â†“
Scraper Executes
```

---

### Recommended Target Metadata

```text
targetType
platform
searchKeyword
profileId
feedSource
priority
```

---

### Architecture Implication

Target selection should remain independent from scraper execution logic.

This allows adding new target types without modifying scraping internals.

---

### Operational Philosophy

Discovery should remain flexible.

The backend should support multiple acquisition strategies rather than relying on a single content source.

---

### Locked Decision 33 â€” Scraper Queue Ordering Strategy

Chosen: FIFO queue ordering.

---

### Meaning

Scrape jobs will execute in the order they are added to the queue.

No additional priority layer is introduced at this stage.

---

### Queue Philosophy

The system should remain simple during early implementation.

Complex prioritization can be introduced later if needed.

---

### Execution Flow

```text
Job Added To Queue
â†“
First Job Picked
â†“
Worker Executes
â†“
Next Job Picked
```

---

### Why This Was Chosen

- Simpler implementation
- Lower operational complexity
- Easier debugging
- Predictable queue behavior
- Faster development cycle

---

### Future Expansion

Priority queues may be introduced later.

Potential future levels:

```text
High â†’ trending spikes
Medium â†’ scheduled scraping
Low â†’ historical refresh
```

---

### Architecture Implication

Queue ordering logic remains independent from worker logic.

This allows future migration to priority-based execution without redesigning workers.

---

### Operational Philosophy

Queue simplicity is preferred in early-stage backend development.

Optimization can occur once scraping volume and business requirements become clearer.

---

### Locked Decision 34 â€” Scraper Result Storage Strategy

Chosen: Temporary raw storage layer.

---

### Meaning

Scraped raw payloads should be stored temporarily before parsing.

The system should not immediately discard raw extraction after scraping.

---

### Storage Philosophy

Raw scraping output becomes a recoverable checkpoint.

This allows:

- parser retries
- debugging
- replay capability
- pipeline recovery

---

### Supported Raw Payload Types

```text
HTML snapshots
API response payloads
DOM extraction
page metadata
network response bodies
```

---

### Raw Data Flow

```text
Scraper Executes
â†“
Raw Payload Stored
â†“
Queue References Payload
â†“
Parser Consumes Payload
â†“
Normalized Data Generated
```

---

### Why This Was Chosen

- Enables replayability
- Helps parser debugging
- Reduces data loss risk
- Supports failed worker recovery
- Improves system observability

---

### Recommended Storage Ownership

Raw storage belongs to the ingestion pipeline.

Recommended location:

```text
/modules/scraper/raw-storage
```

---

### Recommended Storage Metadata

```text
payloadId
platform
source
scrapedAt
jobId
payloadType
status
```

---

### Database Relationship

Temporary raw storage references should connect to PostgreSQL records.

Example:

```text
raw_payload_id
â†“
linked parsing record
```

---

### Lifecycle Recommendation

Raw payloads should not remain permanently.

Suggested lifecycle:

```text
retain for X days
archive if needed
cleanup automatically
```

---

### Architecture Implication

Raw storage becomes a buffer layer between scraping and parsing.

This reduces pipeline fragility.

---

### Operational Philosophy

Scraping should create recoverable checkpoints.

The backend should tolerate downstream failures without losing source data.


---

### Locked Decision 35 â€” Raw Storage Cleanup Strategy

Chosen: Short time-based retention.

---

### Meaning

Raw payloads remain temporary and are automatically deleted after a short retention period.

The system avoids keeping unnecessary raw scraping data permanently.

---

### Cleanup Philosophy

Raw payloads are valuable for debugging and parser recovery.

However, long-term retention creates:

- storage bloat
- unnecessary DB growth
- higher infrastructure cost
- reduced query efficiency

---

### Retention Strategy

Recommended retention window:

```text
24â€“72 hours
```

This provides enough time for:

- parser retry
- replay debugging
- worker recovery
- failed pipeline inspection

---

### Cleanup Flow

```text
Payload Stored
â†“
Retention Timer Starts
â†“
Payload Expires
â†“
Cleanup Worker Deletes Payload
```

---

### Why This Was Chosen

- Prevents useless data accumulation
- Keeps database lightweight
- Preserves short-term replay capability
- Supports debugging without permanent storage
- Better operational efficiency

---

### Recommended Cleanup Ownership

Cleanup should run as scheduled maintenance.

Recommended location:

```text
/modules/scraper/raw-storage-cleaner
```

---

### Recommended Cleanup Metadata

```text
expiresAt
createdAt
lastParsedAt
retentionPolicy
cleanupStatus
```

---

### Architecture Implication

Raw storage remains a transient buffer layer.

Cleanup logic should remain independent from parser logic.

---

### Operational Philosophy

Raw data exists for resilience, not long-term analytics.

The system should prioritize clean storage and high throughput.
### Question 36 â€” Scraper Payload Strategy

Before parser architecture, we must define how scraped data is packaged and transferred.

This directly affects parser complexity, storage structure, retry behavior, and normalization.

---

### Core Question

When scraper finishes collecting data, what should it send?

Possible structures:

```text
Whole page HTML
Single post payload
Multiple posts grouped
Structured extracted blocks
```

---

### Recommended Architecture

Use:

```text
One payload per post
```

not one payload per entire page.

---

### Why Whole Page HTML Is Problematic

If scraper sends full page HTML:

```text
Feed page
â†“
Contains 10â€“30 posts
â†“
Parser must separate every post
â†“
High complexity
â†“
Hard retries
â†“
Large payload size
```

Problems:

- parser becomes overloaded
- retrying one failed post becomes impossible
- difficult post-level tracing
- unnecessary HTML duplication
- poor queue granularity

---

### Recommended Payload Strategy

Scraper should:

1. Scroll page
2. Detect visible post containers
3. Extract one post block at a time
4. Package each post individually
5. Push each post as separate queue item

---

### Recommended Flow

```text
Feed Page Loaded
â†“
Posts Detected
â†“
For Each Post
â†“
Extract Post Container
â†“
Create Payload
â†“
Push To Queue
```

---

### Example Payload Unit

```json
{
  "platform": "instagram",
  "postId": "abc123",
  "scrapedAt": "timestamp",
  "payloadType": "post-html",
  "content": "<article>...</article>"
}
```

---

### Meaning

The scraper still visits a full page.

But it should not send the full page downstream.

Instead:

```text
page = discovery
post = processing unit
```

---

### Benefits

- cleaner parser logic
- post-level retry
- smaller payloads
- better queue scaling
- easier debugging
- easier normalization
- platform-independent extraction

---

### Architecture Implication

Scraper becomes responsible for:

```text
page traversal
post segmentation
payload creation
```

Parser becomes responsible for:

```text
metadata extraction
cleaning
normalization
validation
```

---

### Operational Philosophy

A page is a discovery surface.

A post is the real processing unit.

The system should treat each post independently.


---

### Locked Decision 37 â€” Parser Input Format

Chosen: HTML + lightweight scraper metadata.

---

### Meaning

Each post payload should contain:

- raw post HTML fragment
- lightweight contextual metadata
- scraping context

The scraper remains responsible for collection.

The parser remains responsible for intelligence extraction.

---

### Recommended Payload Structure

```json
{
  "platform": "instagram",
  "postId": "abc123",
  "postUrl": "...",
  "scrapedAt": "timestamp",
  "source": "feed",
  "payloadType": "post-html",
  "html": "<article>...</article>"
}
```

---

### Why This Was Chosen

- Keeps scraper lightweight
- Avoids duplicate extraction logic
- Preserves raw structure for parser
- Provides useful contextual metadata
- Improves debugging and traceability

---

### Metadata Ownership

Scraper provides:

```text
platform
postId
postUrl
scrapedAt
source
payloadType
```

Parser provides:

```text
hashtags
likes
comments
engagement metrics
normalized fields
```

---

### Architecture Implication

Scraper performs:

```text
collection
segmentation
packaging
```

Parser performs:

```text
interpretation
extraction
normalization
validation
```

---

### Operational Philosophy

Scraper should transport context.

Parser should create meaning.


---

### Locked Decision 38 â€” Parser Extraction Strategy

Chosen: Hybrid extraction engine.

---

### Meaning

Parser should not rely on a single extraction method.

Social platforms change structure frequently.

The parser must support multiple extraction techniques.

---

### Supported Extraction Methods

```text
CSS selectors
Attribute scanning
Regex fallback
Text pattern matching
Embedded JSON extraction
API response parsing
GraphQL response parsing
```

---

### Why This Was Chosen

- DOM structure may change frequently
- Different platforms expose data differently
- Some data exists in HTML
- Some data exists inside embedded JSON
- Some data exists in API or GraphQL responses
- Improves parser resilience

---

### Extraction Philosophy

Parser should attempt extraction through layered strategies.

Not every post source will provide identical structure.

---

### Recommended Extraction Flow

```text
Receive Payload
â†“
Identify Payload Type
â†“
Apply Primary Extraction
â†“
Fallback Extraction
â†“
Normalize Values
â†“
Validate Fields
```

---

### Example Extraction Sources

#### HTML DOM

```text
article tags
engagement containers
caption blocks
metadata sections
```

---

#### Embedded JSON

```text
window.__INITIAL_STATE__
script[type="application/json"]
```

---

#### API Responses

```text
REST payload
XHR response
network payload
```

---

#### GraphQL Responses

```text
query response
node tree
edge collection
```

---

### Recommended Architecture Location

```text
/modules/parser/extractors
```

---

### Suggested Internal Structure

```text
extractors/
  htmlExtractor
  apiExtractor
  graphqlExtractor
  regexExtractor
  fallbackExtractor
```

---

### Architecture Implication

Extraction becomes modular.

New strategies can be added without changing parser core.

---

### Operational Philosophy

Parser should remain resilient to platform evolution.

Extraction should adapt to multiple payload sources rather than depending on a single DOM strategy.

---

### Locked Decision 39 â€” Parser Rule Ownership

Chosen: Platform-specific extraction rules.

---

### Meaning

Extraction rules should be separated by platform.

Each platform maintains its own selectors, extraction logic, and fallback behavior.

---

### Recommended Structure

```text
parser/
  extractors/
    instagram/
      selectors.ts
      extractors.ts
      fallbacks.ts

    linkedin/
      selectors.ts
      extractors.ts
      fallbacks.ts
```

---

### Why This Was Chosen

- Platforms expose different DOM structures
- Selectors evolve independently
- Easier maintenance
- Cleaner ownership
- Better debugging
- Lower cross-platform coupling

---

### Rule Ownership Philosophy

Parser core should remain generic.

Platform-specific rules should contain:

```text
selectors
field mappings
fallback strategies
JSON extraction paths
GraphQL traversal rules
```

---

### Recommended Flow

```text
Payload Received
â†“
Identify Platform
â†“
Load Platform Rules
â†“
Run Extraction
â†“
Normalize Output
```

---

### Example Separation

#### Instagram

```text
caption selector
engagement selector
hashtags extraction
embedded JSON rules
```

---

#### LinkedIn

```text
feed post selector
reaction counter selector
comment count selector
GraphQL extraction
```

---

### Recommended Architecture Location

```text
/modules/parser/platforms
```

---

### Suggested Folder Structure

```text
platforms/
  instagram/
    selectors
    extractor
    validator

  linkedin/
    selectors
    extractor
    validator
```

---

### Architecture Implication

Parser becomes extensible.

Adding a new platform does not require rewriting parser core.

---

### Operational Philosophy

Parser logic should remain modular.

Platform behavior should stay isolated within dedicated rule ownership.



# Database Schema Decisions (Locked)

---

### Question 52 — Core Entity Strategy

Before designing tables, we must define what the system revolves around.

---

### Final Decision

Use a **Hybrid Model** where:

```text
posts = source of truth
hashtags = primary query surface
```

---

### Meaning

- Posts are stored as the original ingested data
- Hashtags are extracted and used for querying, analytics, and frontend

---

### Why Not Pure Post-Centric

Although scraping is post-based:

```text
posts → not directly useful for end users
```

The system’s goal is not to show posts, but to:

- identify trending hashtags
- analyze engagement patterns

---

### Why Not Pure Hashtag-Centric

Removing posts would mean:

- no traceability
- no reprocessing capability
- no validation of extracted data

```text
No posts = no source of truth
```

---

### Final Architecture Interpretation

```text
Scraper → collects posts
Parser → extracts hashtags

posts table → backend integrity
hashtags table → frontend + analytics
```

---

### Benefits

- Clean separation of ingestion and consumption
- Enables future analytics (trend scoring, ML)
- Supports debugging and replay using posts
- Keeps frontend independent of platform structure

---

### Operational Philosophy

```text
Posts are temporary truth
Hashtags are extracted intelligence
```

System stores both — but uses them differently.

---

### Question 53 — Primary Key Strategy (Posts Table)

Before defining relationships, we must decide how each post is uniquely identified inside the system.

---

### Final Decision

Use an **Internal UUID as Primary Key** with a unique constraint on:

```text
(postId + platform)
```

---

### Meaning

- Each post gets a system-generated UUID (`id`)
- Platform-specific identifiers are stored separately
- Uniqueness is enforced across platforms using a composite constraint

---

### Why Not Using postId Directly

```text
postId is platform-dependent
```

Problems:

- Not globally unique
- Can clash across platforms
- Tightly couples DB to external systems

---

### Why Not Composite Primary Key

```text
(postId + platform) as PK
```

Problems:

- Complicates joins
- Harder foreign key references
- Messy query structure

---

### Final Architecture Interpretation

```text
id (UUID) → primary key (internal use)
postId + platform → unique identity (external reference)
```

---

### Benefits

- Clean and simple relationships
- Platform-independent design
- Easier joins and indexing
- Future-proof if platforms change ID formats

---

### Operational Philosophy

```text
System owns identity
Platforms provide reference
```

---

### Question 54 — Hashtag Storage Strategy

Before defining relationships, we must decide how hashtags are stored and linked to posts.

---

### Final Decision

Use a **Separate Hashtags Table + Join Table**

```text
hashtags → unique tags
post_hashtags → mapping table
```

---

### Meaning

- Each hashtag is stored only once in the system
- Posts reference hashtags via a mapping table
- No duplication of hashtag data

---

### Why Not Storing Inside Posts

```text
posts.hashtags = ["#ai", "#ml"]
```

Problems:

- Duplicate data across posts
- Hard to calculate trends
- Inefficient for queries like:
  - top hashtags
  - frequency count
  - cross-platform comparison

---

### Final Architecture Interpretation

```text
posts → source data
hashtags → unique entities
post_hashtags → relationship bridge
```

---

### Benefits

- Enables powerful analytics (counts, ranking, trends)
- Eliminates duplication
- Scales cleanly with large datasets
- Works naturally with normalized schema

---

### Operational Philosophy

```text
Hashtags are shared entities, not post properties
```

---

### Question 55 — Raw Payload Storage Strategy

Before finalizing persistence, we must decide whether raw scraped data should be stored.

---

### Final Decision

Store **Raw Payloads for Every Post** ✅

---

### Meaning

- Each scraped post's original HTML/JSON is stored
- Linked to processed data via reference (rawPayloadRef)
- Acts as source for debugging and reprocessing

---

### Why This Matters

Without raw payload:

```text
Parser mistake = permanent data loss
```

With raw payload:

```text
Parser can be improved → data can be reprocessed
```

---

### Benefits

- Full debugging capability
- Replay / re-parse support
- Audit trail of scraped data
- Safer system evolution

---

### Trade-offs

- Increased storage usage
- Requires cleanup strategy (already planned)

---

### Operational Philosophy

```text
Never lose raw data — it is the ground truth
```

---

### Question 56 — Raw Payload Storage Format

Now we define how raw data should be physically stored.

---

### Final Decision

Use a **Hybrid Storage Format (HTML + JSON)** ✅

---

### Meaning

Each raw payload will store:

```text
HTML → original DOM structure
JSON → structured extracted data (if available)
```

---

### Why Not Only HTML

```text
HTML is unstructured
```

Problems:

- Hard to query specific fields
- Requires parsing again for any insight

---

### Why Not Only JSON

```text
JSON may not always be available or complete
```

Problems:

- Loss of original DOM structure
- Cannot recover if extraction logic fails

---

### Final Architecture Interpretation

```text
raw_payload = {
  html: string,
  json: object (optional)
}
```

---

### Benefits

- Maximum flexibility
- Supports both parsing and querying use-cases
- Future-proof against platform changes
- Enables reprocessing with different strategies

---

### Trade-offs

- Slightly higher storage usage
- Requires structured storage design (JSONB + TEXT)

---

### Operational Philosophy

```text
Store raw data in its richest possible form
```

---

### Question 57 — Engagement Storage Strategy

Before finalizing the posts table, we must decide how engagement data is stored.

---

### Final Decision

Store **Engagement Directly Inside Posts Table** ✅

```text
posts.likes
posts.comments
posts.shares
posts.views
```

---

### Meaning

- Engagement metrics are stored alongside post data
- No separate engagement table exists
- Each post contains its latest engagement snapshot

---

### Why This Decision

- System does not require historical engagement tracking
- Engagement is only used for filtering (threshold) and basic analytics
- Simpler schema → faster queries → fewer joins

---

### Why Not Separate Table

```text
Extra table adds complexity without real benefit (for current scope)
```

Problems avoided:

- unnecessary joins
- over-engineering
- unused flexibility

---

### Final Architecture Interpretation

```text
posts → identity + engagement together
```

---

### Benefits

- Simpler queries
- Better performance
- Easier API layer
- Matches current system requirements

---

### Trade-offs

- No historical tracking (accepted)
- Less flexible for future analytics (can evolve later if needed)

---

### Operational Philosophy

```text
Store only what you need today, evolve when required
```

---

### Question 58 — Engagement Fields Scope

Now that engagement is stored inside posts, we must decide how much data to keep.

---

### Final Decision

Store **All Available Engagement Metrics** ✅

```text
likes
comments
shares
views
```

---

### Meaning

- Even if some fields are not used immediately, they are still stored
- Schema remains stable as system evolves
- No need for future migrations to add missing metrics

---

### Why Not Minimal Storage

```text
Storing only likes (or limited fields)
```

Problems:

- Limits future analytics
- Requires schema changes later
- Reduces flexibility for ranking logic

---

### Final Architecture Interpretation

```text
posts → contains full engagement snapshot
```

---

### Benefits

- Future-proof design
- Supports richer analytics later
- No rework required when requirements grow

---

### Trade-offs

- Some unused fields initially
- Slightly larger row size (acceptable)

---

### Operational Philosophy

```text
Capture more data early, use it when needed
```

---


### Question 59 — Author Storage Strategy

Before finalizing the posts table, we must decide how (and whether) to store author information.

---

### Final Decision

Store **Minimal Author Info Inside Posts Table (Optional Fields)** ✅

```text
posts.author_id (nullable)
posts.author_username (nullable)
```

---

### Meaning

- Author data is not a primary concern of the system
- Stored only if easily available during scraping
- No separate authors table is created

---

### Why This Decision

- Author data is not required for current use-case (hashtag analytics)
- Avoids unnecessary schema complexity
- Keeps system lightweight while retaining optional traceability

---

### Why Not Separate Authors Table

```text
Overkill for current system scope
```

Problems avoided:

- unnecessary joins
- extra table maintenance
- unused relational complexity

---

### Final Architecture Interpretation

```text
posts → may contain lightweight author reference (optional)
```

---

### Benefits

- Simple and flexible
- No over-engineering
- Allows future extension if needed

---

### Trade-offs

- No centralized author analytics
- Limited reuse of author data

---

### Operational Philosophy

```text
Store only what adds value — keep optional data lightweight
```

---

### Question 60 — Timestamp Strategy

Before finalizing the posts table, we must define how time-related data is stored.

---

### Final Decision

Store **Both Posted Time and Scraped Time** ✅

```text
posts.posted_at
posts.scraped_at
```

---

### Meaning

- `posted_at` → when the post was originally created on the platform
- `scraped_at` → when our system fetched the post

---

### Why This Matters

```text
posted_at ≠ scraped_at
```

This difference enables:

- freshness analysis
- delay detection
- better trend timing

---

### Why Not Only One Timestamp

Only `scraped_at`:
- loses original timing context

Only `posted_at`:
- unreliable (may be missing or inconsistent)

---

### Final Architecture Interpretation

```text
posts → stores both origin time and ingestion time
```

---

### Benefits

- Enables time-based analytics
- Supports ranking logic (recent vs old posts)
- Improves data accuracy

---

### Trade-offs

- Slight increase in storage (negligible)

---

### Operational Philosophy

```text
Always track both origin and ingestion time
```

---


### Question 61 — Platform Representation

Before finalizing relational structure, we must decide how platforms are represented in the database.

---

### Final Decision

Use a **Separate Platforms Table** with foreign key reference from posts ✅

```text
platforms → platform definitions
posts.platform_id → FK
```

---

### Meaning

- Platforms are treated as first-class entities
- Each post references a platform via `platform_id`
- Platform-specific configurations can be stored centrally

---

### Why Not Enum Inside Posts

```text
posts.platform = "instagram"
```

Problems:

- Hard to extend dynamically
- No place to store platform-level configs
- Tight coupling with application logic

---

### Final Architecture Interpretation

```text
platforms → configuration + identity
posts → reference platform via FK
```

---

### Benefits

- Supports dynamic platform addition/removal
- Enables platform-level configuration (rate limits, selectors, etc.)
- Aligns with modular connector architecture
- Future-proof for scaling across multiple platforms

---

### Trade-offs

- Requires join for platform data
- Slight increase in schema complexity

---

### Operational Philosophy

```text
Platforms are not values, they are system entities
```

---

# Database Schema Decisions (Locked)

---

### Question 61 — Platform Representation

Before finalizing relational structure, we must decide how platforms are represented in the database.

---

### Final Decision

Use a **Separate Platforms Table** with foreign key reference from posts ✅

```text
platforms → platform definitions
posts.platform_id → FK
```

---

### Meaning

- Platforms are treated as first-class entities
- Each post references a platform via `platform_id`
- Platform-specific configurations can be stored centrally

---

### Final Architecture Interpretation

```text
platforms → configuration + identity
posts → reference platform via FK
```

---

### Benefits

- Supports dynamic platform addition/removal
- Enables platform-level configuration (rate limits, selectors, etc.)
- Aligns with modular connector architecture

---

### Trade-offs

- Requires join for platform data
- Slight increase in schema complexity

---

### Operational Philosophy

```text
Platforms are not values, they are system entities
```

---

### Question 62 — URL Storage Strategy

Before finalizing the posts table, we must decide whether to store post URLs.

---

### Final Decision

**Do NOT store URL in posts** ❌

---

### Meaning

- URL is not part of the ingestion payload
- System does not rely on direct navigation to posts
- Identification is handled via `(postId + platform)`

---

### Why This Decision

```text
If it is not part of ingestion, it should not be part of schema
```

- Avoids unnecessary fields
- Keeps schema aligned with actual data flow
- Prevents partial/derived data storage

---

### Final Architecture Interpretation

```text
posts → identified via postId + platform
no dependency on URL
```

---

### Benefits

- Cleaner schema
- No redundant or unavailable data
- Consistent with ingestion pipeline

---

### Trade-offs

- Cannot directly navigate to post from DB
- Slightly harder manual debugging (accepted)

---

### Operational Philosophy

```text
Store only what the system truly owns and receives
```

---


### Question 63 — Deletion Strategy

Before finalizing lifecycle behavior, we must decide how data deletion is handled.

---

### Final Decision

Use **Soft Delete Strategy** via timestamp field ✅

```text
posts.deleted_at
```

---

### Meaning

- Records are not physically removed from database
- Instead, `deleted_at` timestamp marks them as deleted
- Active records are filtered using `deleted_at IS NULL`

---

### Why Not Hard Delete

```text
Permanent deletion = irreversible data loss
```

Problems:

- No recovery possible
- No audit trail
- Harder debugging of pipeline issues

---

### Final Architecture Interpretation

```text
posts → active + soft-deleted records coexist
application layer filters active data
```

---

### Benefits

- Safe data handling
- Enables recovery and debugging
- Maintains auditability

---

### Trade-offs

- Requires filtering in queries
- Slight increase in storage

---

### Operational Philosophy

```text
Never delete data blindly — mark it, don’t lose it
```

---

### Question 64 — Indexing Strategy

Before optimizing performance, we must decide how indexes are applied to the database.

---

### Final Decision

Use **Targeted Indexing Strategy** ✅

---

### Meaning

- Only frequently queried fields are indexed
- Avoid unnecessary indexes during early stage
- Indexes will evolve based on real usage

---

### Initial Index Plan

```text
posts.platform_id
posts.scraped_at
posts.likes
post_hashtags.hashtag_id
```

---

### Why Not Minimal Indexing

```text
No indexes = slow queries at scale
```

Problems:

- Poor performance for filtering and sorting
- Bad user experience in API responses

---

### Why Not Aggressive Indexing

```text
Too many indexes = slower writes
```

Problems:

- Increased insert/update cost
- Wasted resources on unused indexes

---

### Final Architecture Interpretation

```text
Indexes are driven by query patterns, not assumptions
```

---

### Benefits

- Balanced read/write performance
- Scales efficiently with data growth
- Avoids premature optimization

---

### Trade-offs

- Requires monitoring and tuning later

---

### Operational Philosophy

```text
Index what you use, not what you guess
```

---

### Question 65 — Pagination Strategy

Before exposing large datasets through APIs, we must define how data is fetched efficiently from the database.

---

### Final Decision

Use **Cursor-Based Pagination** ✅

```text
WHERE id > last_seen_id
LIMIT N
```

---

### Meaning

- Data is fetched relative to the last seen record
- No skipping of rows like offset-based queries
- Works reliably with continuously growing datasets

---

### Why Not Offset Pagination

```text
LIMIT N OFFSET M
```

Problems:

- Slows down as dataset grows
- Skips rows inefficiently
- Inconsistent results with live data updates

---

### Final Architecture Interpretation

```text
Client → sends cursor
DB → returns next set of records
```

---

### Benefits

- High performance at scale
- Consistent pagination
- Ideal for real-time and growing datasets

---

### Trade-offs

- Slightly more complex implementation
- Requires stable sorting key (id or timestamp)

---

### Operational Philosophy

```text
Pagination should scale with data, not break because of it
```

---

### Question 66 — Unique Constraint Strategy (Posts)

Before finalizing data integrity, we must define how duplicate posts are prevented.

---

### Final Decision

Use **Composite Unique Constraint on (postId + platform_id)** ✅

```text
UNIQUE(postId, platform_id)
```

---

### Meaning

- A post is uniquely identified by its platform-specific ID + platform
- Prevents duplicate ingestion of the same post
- Works across multiple platforms safely

---

### Why Not postId Alone

```text
postId is not globally unique
```

Problems:

- Collisions across platforms
- Data integrity issues

---

### Why Not Handling in Code

```text
App-level checks are not reliable under concurrency
```

Problems:

- Race conditions
- Duplicate records under load

---

### Final Architecture Interpretation

```text
DB enforces uniqueness
application trusts DB guarantees
```

---

### Benefits

- Strong data integrity
- Prevents duplicate ingestion
- Safe under concurrent workers

---

### Trade-offs

- Slight overhead on insert (acceptable)

---

### Operational Philosophy

```text
Critical constraints must live in the database, not in code
```

---
