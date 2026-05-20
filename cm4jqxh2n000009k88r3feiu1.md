---
title: "WebAssembly 101: Bridging the Gap Between Web and Machine"
seoTitle: "Intro to WebAssembly: Connecting Web and Machine"
seoDescription: "Discover the power of WebAssembly: bridging web and machine, beyond browsers, with WebAssembly System Interface (WASI) for optimized performance"
datePublished: 2024-12-11T10:27:08.591Z
cuid: cm4jqxh2n000009k88r3feiu1
slug: webassembly-101-bridging-the-gap-between-web-and-machine
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1733911769834/df571f63-3e69-45b0-8280-0e044cec137a.jpeg
tags: webassembly, wasm, overview, wasi

---

Here was/is/still is my high level understanding of WebAssembly when I started to look into it in more details: It takes your program in a language that supports for WebAssembly (wasm) and takes it to that very intermediary step for it to be compiled to what is very close in resemblance to the machine code (binary) executable.

According to Mozilla Developer Network (MDN):

> WebAssembly is a type of code that can be run in modern web browsers — it is a low-level assembly-like language with a compact binary format that runs with near-native performance and provides languages such as C/C++, C# and Rust with a compilation target so that they can run on the web. It is also designed to run alongside JavaScript, allowing both to work together.

I added this to point out that although on the surface we see a lot of emphasis on `Web` and the name itself **Web**Assembly carries the same emphasis, it is not all `Web` stuff.

## WebAssembly is not just for the browser, but it was

Maintainers of WebAssembly use the term `Embedding` which seems to be in reference to how a WebAssembly module/application can be integrated into a larger environment. This larger environment provides the WebAssembly module to come alive and do its work. This larger environment or host provides I/O, system calls, and memory access that a WebAssembly module needs, an execution context, or a runtime. In its most simplest term WebAssembly module is nothing but a set of low-level instructions that needs to be `embedded` in order to do its work.

Originally the intent for WASM was to address and target web based applications' performance in the browser. As developers realized that since this WASM thing can run in the browser's runtime or `web embedded` across multiple Operating Systems, then what the heck let's tweak it and extend it beyond the browser runtime, within a standalone runtime that's embedded directly on an Operating System, `Non-Web embedded`.

# Runtime and Host

WASM requires an intermediary, for example for web embedded module needs a browser runtime and a non-web embedded module requires another intermediary like wasm time, wasmedge or nodejs. It is via these intermediaries that WASM module gets to interact with the underlying browser or operating system.

Another way to think about it, runtime is what WASM needs to become executable but it requires host services to interact with its outside world like a browser or host services to interact with OS' memory, network access and io.

## WebAssembly System Interface (WASI) and Cellular Biology huh?

is there an analogy there waiting to be found for the WASM-WASI? Yes, yes there is. Just bear with me for a sec.

In cellular biology, there are these things (specialized proteins) called cell surface receptors. These receptors are (think WASI):

* Specialized interfaces on cell membrane
    
* Selectively allow specific molecular interactions
    
* Translate external signals into internal cellular responses
    
* Act as precise, controlled gateways between the cell's internal environment and the external world
    

Similarly, in WebAssembly ecosystem WASI functions remarkably like these cellular receptors:

1. Specialized Interface:
    

* Cell Receptor: A specific protein designed to bind only certain molecules
    
* WASI: A specialized interface designed to enable controlled interactions between WebAssembly modules and system resources
    

2. Selective Interaction:
    

* Cell Receptor: Allows only specific ligands (it's a molecule) to trigger a cellular response
    
* WASI: Provides capability-based access (a concept in designing secure compute systems), where only explicitly granted capabilities can be used
    

3. Signal Translation:
    

* Cell Receptor: Converts external chemical signals into internal cellular processes
    
* WASI: Translates system-level requests into safe, sandboxed operations within WebAssembly modules
    

4. Controlled Gateway:
    

* Cell Receptor: Controls what enters and influences the cell
    
* WASI: Manages and restricts how WebAssembly modules interact with host system resources
    

You get the gist. Of course, WASI does whole lot more and you can get deeper with all of the wonderful goings on by visiting their GitHub [repository](https://github.com/WebAssembly/WASI) as a starting point.

We can go on for days talking about WASM and its ecosystem, but this should be enough for a very high level understanding of this technology to hopefully be thirsty to go and find out more.

Design and high-level overview of WebAssembly [https://github.com/WebAssembly/design](https://github.com/WebAssembly/design)  
WASI high level goals: [https://github.com/WebAssembly/WASI?tab=readme-ov-file#wasi-high-level-goals](https://github.com/WebAssembly/WASI?tab=readme-ov-file#wasi-high-level-goals)

`opinions are all me own`