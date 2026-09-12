---
layout: default
title: Flare Learning Hub
---

# Flare Learning Hub

Reverse engineering, malware analysis, Windows internals, and low-level security notes.

This site contains technical write-ups, lab analyses, and notes created while learning how executables work at the assembly and operating-system level.

## Latest Blogs

{% for post in site.posts limit:5 %}

### [{{ post.title }}]({{ post.url | relative_url }})

{{ post.date | date: "%B %d, %Y" }}

{% if post.description %}
{{ post.description }}
{% endif %}

{% endfor %}

[View all blogs]({{ '/blogs/' | relative_url }})

## Topics

- Reverse Engineering
- Malware Analysis
- x86 / x86-64 Assembly
- Windows Internals
- PE File Format
- Debugging
- Low-Level Programming

## About

Hey, I'm Umut Bayram. Glad you're here!

I'm curious about what happens underneath the code we write. This blog is where I share what I'm learning about reverse engineering, malware analysis, and Windows internals, often by opening a binary and working through it one instruction at a time.

Think of these posts as notes from someone learning alongside you. I try to explain the reasoning behind each step, especially the bits that made me pause and ask, "Wait, why does that work?" If you've ever stared at a stack frame or an assembly instruction until it finally clicked, you'll feel at home here.

If you have a question, spot a mistake, or just want to talk about something interesting, [say hello on LinkedIn](https://www.linkedin.com/in/umut-bayram-166933242/). I'd love to hear what you're learning, too.
