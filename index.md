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

I use this site to document what I learn while analyzing binaries and working through reverse-engineering and malware-analysis labs.

The goal is to understand what the machine is actually doing rather than relying only on decompiled pseudocode.
