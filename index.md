---
layout: default
title: umut3806
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

I like digging into how things work, why they break, and what we can learn from them. This is where I share my security research and the things I find interesting along the way, from CVE write-ups and vulnerability root-cause analysis to reverse engineering, malware analysis, and new techniques.

Think of these posts as a chance to sit down and work through an interesting problem together. I want to share the questions, reasoning, and small discoveries that help things make sense. Whether you're exploring a topic for the first time or bringing your own experience to it, I hope you find something useful here.

If you have a question, spot a mistake, or just want to talk about something interesting, [say hello on LinkedIn](https://www.linkedin.com/in/umut-bayram-166933242/). I'd love to hear what you're learning, too.
