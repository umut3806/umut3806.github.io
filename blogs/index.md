---
layout: default
title: Blogs
permalink: /blogs/
---

<link rel="stylesheet" href="{{ '/assets/css/blog-list.css' | relative_url }}">

# Blogs

{% for post in site.posts %}
{% include blog-card.html post=post heading_level=2 %}
{% endfor %}
