---
title: "OpenAI Text Embeddings + Streamlit + Pinecone Vector Database"
datePublished: 2024-02-11T00:27:59.490Z
cuid: clsgrnzwi000109l2cmuj3pxk
slug: openai-streamlit-and-pinecone-db
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1707632477255/3921c60b-d583-4269-b34d-06002893ce93.webp
ogImage: https://cdn.hashnode.com/res/hashnode/image/upload/v1707632515502/f845462f-4bfc-43d9-8fab-f9a51e336548.webp
tags: streamlit, pinecone, openai-embedding

---

### What we're looking at

The idea was to use [OpenAI text embeddings](https://platform.openai.com/docs/guides/embeddings), [Pinecone](https://www.pinecone.io/), and [Streamlit](https://streamlit.io/) to play around with an idea I had to prototype around an idea to help me learn new things by using a hands-on approach.

Some time back I started working on a web app to simulate study flashcards. The web application is still a work in progress, but here is the gist of what I can do with it. The UI shows a question or a scenario in form of a card and I can test my knowledge by answering them and validate my answer or rather my understanding by flipping the card to check. Here is a quick demo:

<iframe src="https://dhbtuus86mod.cloudfront.net/flashcardwebapp.mp4" width="100%" height="800px"></iframe>

To begin with, I started manually finding the content, extracting the data, and saving them in a datastore - the fancy name for a text file in this case.

To automate gathering the question and answer data I thought I give Streamlit a try. Using Stramlit I was able to quickly put together a

* UI where I could provide a prompt
    

* have OpenAI generate the content in response to my prompt and render that in Streamlit UI
    
* generate OpenAI text embeddings to create embeddings of the prompt (their representation in high-dimensional vector space) with OpenAI's \`text-embedding-3-small\` text embedding model
    
* construct an object containing both the prompt's embedding and the text response to the prompt as is to the Pinecone database
    

For this prototype, the idea was to start by saving the prompt in a vector space and be able to conduct searches based on similarity to see whether the question (prompt) was asked before. In the future, I might save the embedding of the response as well.

The following video demonstrates the following

* a search is being issued on the term `HNSW`
    
* under the hood, we check if a similar prompt/question was asked before
    
* if not then a response is generated via OpenAI's chatgpt
    
* a save to the database is issued
    
* subsequently, a similar search is issued which contains the term used before, `HNSW`, but this time as we check whether a similar prompt/question is present in the database (we expect that there is), Pinecone returns a search hit with a similarity score high enough for me to have a second look.
    

<iframe src="https://dhbtuus86mod.cloudfront.net/channel-1-display-0.mp4" width="100%" height="500px"></iframe>

Work is still ongoing to figure out an integration with the flashcard web app I mentioned earlier. But, whether this is an optimal use of Pinecone, Streamlit or the best way of creating a web app that simulates flashcards is not my end goal. The goal was (and is) to learn by doing and then repeat.

## What I learned

### Streamlit

What I learned so far. Streamlit provides an easy framework to wrap ideas for working with data and large language models. Before this, I hadn't written anything from scratch using Python. However, given my background in JS and Java languages, it was easy to get started.

They offer APIs with built-in functionality that cater to data visualization, chat interactivity, forms, session state management, and others. State management was one thing I struggled with a bit to get my head around, but they do provide examples to get you going.

I'm not going to get into whether Streamlit is mature enough or production-ready. All I can say is that it helped me to start quickly prototyping an idea with ease in my local environment and for now I will continue to use it for my projects in addition to prototypes, demos, and presentations I feel the need to share with an audience.

They have a vibrant [communit](https://streamlit.io/community)y behind them. At the time of this writing their [GitHub repo](https://github.com/streamlit/streamlit) has over 30k likes. I feel that as time progresses they will address some of the questions around Streamlit's scalability, deployment, and state management. So, like anything else, the choice for using Streamlit is based on your project's requirement and striking a balance between its ease of development, and the need for scalability, customization, and performance.

### Pinecone

Pinecone provides you with a managed vector database. That means no operations and management overhead. It's purpose-built for handling vector embeddings so you can use it for ML applications that do recommendation systems, similarity searches, and NLP tasks.

More [information about the product is well worth a look](https://www.pinecone.io/product/).

Pinecone, as a vector database, is one of the leaders in this space. So far, I've enjoyed working with it given its ease of use and well-documented material to get me started.

Cost-wise for a puny project like mine it revolves around pennies when I finish the end-end flow.

In the next parts of this article, I'll share the code, give more insight into the nuances of my approach, and move toward the integration of data generated and saved in Pinecone with the flashcard app.