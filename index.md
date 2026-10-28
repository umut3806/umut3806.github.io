---
layout: default
title: umut3806
---

<link rel="stylesheet" href="{{ '/assets/css/blog-list.css' | relative_url }}">

# Welcome to umut3806's corner of the internet!

## Latest Blogs

{% for post in site.posts limit:5 %}
{% include blog-card.html post=post heading_level=3 %}
{% endfor %}

[View all blogs]({{ '/blogs/' | relative_url }})

## About

Hey, I'm Umut Bayram. Glad you're here!

I like digging into how things work, why they break, and what we can learn from them. This is where I share my security research and the things I find interesting along the way, from CVE write-ups and vulnerability root-cause analysis to reverse engineering, malware analysis, and new techniques.

Think of these posts as a chance to sit down and work through an interesting problem together. I want to share the questions, reasoning, and small discoveries that help things make sense. Whether you're exploring a topic for the first time or bringing your own experience to it, I hope you find something useful here.

If you have a question, spot a mistake, or just want to talk about something interesting, [say hello on LinkedIn](https://www.linkedin.com/in/umut-bayram-166933242/). I'd love to hear what you're learning, too.

## Disclaimer

All content on this site, including articles, code, tools, and examples, is provided for educational and informational purposes only. Use any techniques described here only on systems you own or have explicit permission to test. You are solely responsible for your actions and for complying with applicable laws. I do not endorse unauthorized or malicious activity and accept no responsibility for any misuse of this content or any resulting damage.
