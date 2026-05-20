---
title: "OpenAI Text Embeddings + Streamlit + Pinecone Vector Database - part 2"
datePublished: 2024-02-14T05:27:20.225Z
cuid: clslcoiht000809la21j32oje
slug: openai-text-embeddings-streamlit-pinecone-vector-database-part-2
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1707888084541/abdcba96-e14a-477c-b120-dd446d909996.webp
ogImage: https://cdn.hashnode.com/res/hashnode/image/upload/v1707888351703/4a169e56-3fcb-43f9-83d2-9e2124da1c49.webp
tags: streamlit, pinecone, vector-embeddings

---

In the [previous post](https://kamc.hashnode.dev/openai-streamlit-and-pinecone-db), I covered the basic idea of what I was trying to achieve. It's a short read and contains the context backing this article. However, here is a quick recap:

I'm using OpenAI to generate text, generate embeddings of that text, and save the embeddings in the Pinecone vector database in addition to taking advantage of Pincone's ability to perform similarity searches to see whether the question has been asked before - all with help of a UI put together using Streamlit framework.

In this post I'm just going to provide the codebase - still a work in progress - used so far for putting together this prototype. Note that this was my first soiree with Python - Streamlit is a Python-based framework. So, there might be places where I could have done a better job, feel free to provide advice.

You can find the code located at my github repo, [flashcards\_data](https://github.com/KazChe/flashcards_data). There are still some work to do around:

* fixes to the UI
    
* more refactoring
    
* design, and implementation of a communication mechanism to transfer/share the data with my web application.
    

Thank you for reading.