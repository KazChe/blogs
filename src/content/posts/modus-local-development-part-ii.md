---
title: "A Look at Modus and the Future of Model-Native Apps - Part II"
seoTitle: "Future of Model-Native Apps: Modus Part II"
seoDescription: "Explore Modus and future of Model-Native apps, learn to create GraphQL endpoints with embedded AI/ML models, and local app setup"
datePublished: 2025-01-27T04:22:10.421Z
cuid: cm6ejl5o5000009ib5tiq29xi
slug: modus-local-development-part-ii
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1737691841895/dbb27480-2bdf-4d23-b057-8a98b630c810.jpeg
tags: graphql, modus, hypermode, model-native-apps, intelligent-api

---

In [Part I](https://kamc.hashnode.dev/challenging-hype-modus-model-native) we scratched the surface on Modus and how its Model-Native apps concept aims to shift our designs by embedding AI/ML models as foundational components in developing intelligent APIs. Now we're going to create a overly simple GraphQL endpoint that received a request and based on its content responds with some over-the-top sarcastic response.

Let's go through the high level flow of this modus app which the gist of it can be summarized in the following screenshot:

![IMG](https://dhbtuus86mod.cloudfront.net/graphql-req-resp.png)

- This is a modus app and it's running locally as you can tell
- It has a GraphQL `Query` type
- Along with a `generateExecses` method that returns us a `String` and a parameter call `event` that seems to be an invite to a wedding of some sort
- In the response portion of the UI we see a response to this call that provides couple of legit execuses

## Behind the scenes

As we mentioned in [part I](https://kamc.hashnode.dev/challenging-the-hype-a-look-at-modus-and-the-future-of-model-native-apps-part-1) of this series `modus.json` is like a manifest of your modus app.


```json
{
  "$schema": "https://schema.hypermode.com/modus.json",
  "endpoints": {
    "default": {
      "type": "graphql",
      "path": "/graphql",
      "auth": "bearer-token"
    }
  },
  "connections": {
    "openai": {
      "type": "http",
      "baseUrl": "https://api.openai.com/",
      "headers": {
        "Authorization": "Bearer {{API_KEY}}"
      }
    }
  },
  "models": {
    "llm": {
      "sourceModel": "gpt-4o",
      "connection": "openai",
      "path": "v1/chat/completions"
    }
  }
}
```

and our `index.ts`, which serves as your main export for our AssemblyScript function `generateExcuses()` and makes it available in our app's generated API.

```js
import { models } from "@hypermode/modus-sdk-as";
import {
  OpenAIChatModel,
  SystemMessage,
  UserMessage,
} from "@hypermode/modus-sdk-as/models/openai/chat";

export function generateExcuses(event: string): string {
  const modelName: string = "llm";
  const model = models.getModel<OpenAIChatModel>(modelName);

  const prompt = `Generate 2 absurd, sarcastic, over-the-top and dark excuses for why I can't attend "${event}".
  Make them elaborate, ridiculous, and completely unbelievable.
  Each excuse should be at least 2 sentences long.
  Format the response as a JSON array of strings, with each excuse as a separate element.`;

  const input = model.createInput([
    new SystemMessage(
      "You are a creative, dark and sarcastic excuse generator. Your excuses should be outlandish and humorous."
    ),
    new UserMessage(prompt),
  ]);

  // set temperature to higher value for more creative responses
  input.temperature = 0.9;

  const response = model.invoke(input);
  return response.choices[0].message.content.trim();
}
```

to run the app locally we issue:
```bash
npx modus dev
```
and we will see an output like the following:

![IMG](https://dhbtuus86mod.cloudfront.net/npx-run-modus-output.png)

You can then use either of the following endpoints to interact with your app:

```bash
Your local endpoint is ready!
GraphQL (default): http://localhost:8686/graphql
View endpoint: http://localhost:8686/explorer
```

![IMG](https://dhbtuus86mod.cloudfront.net/graphql-req-resp.png)

Diagram below depicts the high level interaction and flow of how this simple modus app works:

![IMG](https://dhbtuus86mod.cloudfront.net/modus-blog-local-sample-app.png)

Codebase is available [here](https://github.com/KazChe/modus-intelligent-api). Follow its [`README`](https://github.com/KazChe/modus-intelligent-api/blob/main/README.md) for setting up your local environment.

In Part III, we will cover importing our Modus app into the Hypermode platform. While local development offers more immediate control and testing capabilities, deploying to Hypermode provides a more robust, production-ready environment with features for managing, securing, and observing your app.

`all opinions are me own`