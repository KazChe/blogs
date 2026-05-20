---
title: "Getting Started with Semantic Search Using Neo4j and Google Vertex AI - Part 1"
seoTitle: "Semantic Search Basics with Neo4j & Google AI"
seoDescription: "Explore semantic search with Neo4j and Google Vertex AI for executive profiles, focusing on implementation and resolving search relevance challenges"
datePublished: 2024-11-14T14:00:49.054Z
cuid: cm3hdo9em001209l7chvdgyp0
slug: semantic-search-with-neo4j-and-google-vertex-ai-part-1
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1731532588950/dd949c45-488c-43cd-88a6-acaeb346047b.jpeg
ogImage: https://cdn.hashnode.com/res/hashnode/image/upload/v1731533050376/66bb585a-bdd4-4e7b-8839-b33aa8b7c4dc.jpeg
tags: neo4j, nodejs, vertex-ai, vector-database, vector-embeddings

---

## Introduction

In this article I’ll go through a fictitious use case building a semantic search for executive profiles. We chose Neo4j for its graph capabilities and Google Vertex AI for its powerful embedding models. This two part series shares, although simple, but one of many possible paths, challenges, and learnings in implementing such a solution. It is not about why specific set of technologies were used but more focused on the overall concepts of semantic search and how it can be further enriched by providing more contextual, real-life meanings through using a graph database.

***This is not an introductory guide to Neo4j Graph Database, Vertex AI Text-Embedding Models, or Vector search. Working knowledge of these topics and concepts is encouraged.***

Part 1 focuses on our initial implementation and the challenges faced with search relevance. Source code for part 1: [https://github.com/KazChe/neo4j-vertex-semantic-search](https://github.com/KazChe/neo4j-vertex-semantic-search)

## Technical Stack

Our implementation relies on:

* **Database**: Neo4j with Vector Index capability
    
* **Embedding Generation**: Google Vertex AI (textembedding-gecko@003)
    
* **Programming Language**: Node.js
    
* **Key Dependencies**:
    
    ```json
    {
      "@google-cloud/aiplatform": "^3.31.0",
      "axios": "^1.7.7",
      "dotenv": "^16.4.5",
      "google-auth-library": "^9.14.2",
      "neo4j-driver": "^5.26.0"
    }
    ```
    

## Implementation Details

### 1\. Configuration and Setup

Our application uses environment variables for configuration, managed through `dotenv`:

```javascript
const config = {
  neo4j: {
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  },
  google: {
    projectId: process.env.GOOGLE_PROJECT_ID,
    location: process.env.GOOGLE_LOCATION || "us-central1",
    model: process.env.VERTEX_MODEL || "textembedding-gecko@003",
  },
  batch: {
    size: parseInt(process.env.BATCH_SIZE) || 5,
    vectorDimensions: parseInt(process.env.VECTOR_DIMENSIONS) || 768,
    similarityFunction: process.env.SIMILARITY_FUNCTION || "cosine",
    indexName: process.env.INDEX_NAME || "bio_text_embeddings",
    indexWaitTimeout: parseInt(process.env.INDEX_WAIT_TIMEOUT) || 300,
  },
};
```

### Loading Sample Data

Before we can generate embeddings, we need to populate our database with executive profiles. Here's our data loading implementation:

```javascript
const neo4j = require("neo4j-driver");

// JSON data
const data = {
  executives: [
    {
      name: "Alice Johnson",
      title: "Chief Marketing Officer",
      bio: "Alice Johnson is a seasoned marketing executive with over 15 years of experience in digital transformation and brand development. She has led successful marketing campaigns for Fortune 500 companies and pioneered several innovative digital marketing strategies.",
    },
    {
      name: "John Doe",
      title: "Chief Financial Officer",
      bio: "John Doe brings 20 years of financial expertise in technology and manufacturing sectors. He has overseen multiple successful mergers and acquisitions, and specializes in strategic financial planning and risk management.",
    },
  ],
};

// Connect to Neo4j Aura
const uri = "neo4j+s://your-database-uri.databases.neo4j.io";
const user = "your-username";
const password = "your-password";
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

// Define the Cypher query
const cypherQuery = `
// Create constraints for uniqueness
CREATE CONSTRAINT executive_name IF NOT EXISTS
FOR (e:Executive) REQUIRE e.full_name IS UNIQUE;

// Load executives with their bios
UNWIND $executives AS exec
MERGE (e:Executive {full_name: exec.name})
SET 
    e.title = exec.title,
    e.bio = exec.bio;
`;

// Run the query
async function loadExecutives() {
  const session = driver.session();
  try {
    await session.run(cypherQuery, { executives: data.executives });
    console.log("Executives loaded successfully.");
  } catch (error) {
    console.error("Error loading executives:", error);
  } finally {
    await session.close();
  }
}

loadExecutives()
  .then(() => driver.close())
  .catch((error) => console.error("Unexpected error:", error));
```

This implementation:

1. Defines sample executive data
    
2. Establishes a Neo4j connection
    
3. Creates a uniqueness constraint
    
4. Loads the data using a parameterized Cypher query
    
5. Includes proper session and error handling
    

### 2\. Core Components

#### A. Executive Bio Vectorizer (`executive-bio-vectorizer.js`)

This component handles batch processing of executive bios and vector index creation. We implemented batch processing to efficiently handle large numbers of profiles:

```javascript
async function generateEmbeddings(session, accessToken) {
  try {
    const result = await session.run(
      `
      MATCH (n:Executive) WHERE size(n.bio) <> 0
      WITH collect(n) AS nodes, toInteger($batchSize) AS batchSize
      CALL {
        WITH nodes
        CALL genai.vector.encodeBatch([node IN nodes | node.bio], 'VertexAI', {
          model: $model,
          token: $accessToken,
          region: $location,
          projectId: $projectId,
          taskType: "CLUSTERING"
        }) YIELD index, vector
        CALL db.create.setNodeVectorProperty(nodes[index], 'textEmbedding', vector)
        RETURN count(*) AS count
      } IN TRANSACTIONS OF toInteger($batchSize) ROWS
      RETURN sum(count) AS totalCount
      `
    );
    console.log(
      `Successfully processed ${result.records[0].get("totalCount")} records`
    );
  } catch (error) {
    console.error("Embedding generation failed:", error.message);
    throw new Error("Failed to generate embeddings");
  }
}
```

Key aspects:

* Collect all eligible executive nodes using `WHERE size(`[`n.bio`](http://n.bio)`) <> 0`
    
* Process in configurable batch sizes (`$batchSize`)
    
* Use Neo4j's `genai.vector.encodeBatch` for efficient batch processing
    
* Store embeddings directly as node properties
    
* Track progress with count aggregation
    

#### B. Query Client (`query-client.js`)

This component handles semantic search functionality:

```javascript
async function semanticSearch(query, limit = 5) {
  const embeddingResponse = await getEmbedding(query);
  const embedding = embeddingResponse.values;

  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(
      `Invalid embedding: expected array of 768 numbers, got ${embedding}`
    );
  }

  const cypher = `
    CALL db.index.vector.queryNodes($indexName, $k, $embedding)
    YIELD node, score
    RETURN node.full_name AS name, node.bio AS bio, score
    ORDER BY score DESC
  `;

  const results = await queryNeo4j(cypher, {
    indexName: "bio_text_embeddings",
    k: limit,
    embedding: embedding,
  });

  return results.map((record) => ({
    name: record.get("name"),
    bio: record.get("bio"),
    score: record.get("score"),
  }));
}
```

## Challenges and Solutions

### 1\. Vector Index Creation

When implementing vector search in Neo4j, we encountered challenges with the index creation syntax, particularly with property names containing dots:

```javascript
CREATE VECTOR INDEX bio_text_embeddings IF NOT EXISTS
FOR (n:Executive)
ON (n.textEmbedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
  }
}
```

The use of backticks around property names was crucial to avoid syntax errors.

### 2\. Model Selection

Through testing, we found that certain Vertex AI models worked better than others:

```javascript
// Working Models ✅
// textembedding-gecko@003
// textembedding-gecko-multilingual@001

// Non-working Models ❌
// textembedding-gecko@001
// textembedding-gecko@002
```

We selected `textembedding-gecko@003` for its stability and performance.

### 3\. Error Handling

We implemented comprehensive error handling throughout the application:

* Authentication failures
    
* Invalid embeddings
    
* Database connection issues
    
* Vector index creation problems
    

## Next Steps

Future improvements could include:

1. Implementing proper graph relationships for context
    
2. Fine-tuning similarity calculations
    
3. Adding more sophisticated search algorithms
    

The beauty of graph databases lies in their ability to bridge the semantic gap in search results. While vector embeddings capture the essence of text, graph relationships breathe life into these mathematical representations by adding real-world context and connections. This combination creates a more nuanced and intelligent experience that understands not just what is said but how they relate to each other in the real world.

Stay tuned for Part 2, where we'll dive into these improvements and share the dramatic impact on search relevance.

`all opinions are my own and I do not promote any company, creed, or faction`