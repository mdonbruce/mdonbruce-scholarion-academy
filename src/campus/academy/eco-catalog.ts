/**
 * Scholarion Free Education Resource catalog — researched 2026-10-04 from official provider pages
 * (pricing, plan, docs, license and course pages). "verified" records had every stated limit and
 * classification confirmed on the fetched official page; everything else is "pending".
 * evidence.summary is a short description of the page in our own words, not a quote.
 * maps_to links library items to Scholarion courses as Recommended or Supplementary.
 * The monthly terms review re-checks these pages automatically.
 */
export interface CatalogSeed {
  id: string; kind: "tool" | "course" | "reading"; name: string; provider: string; official_url: string; category: string; subjects: string[]; description: string; use_cases: string[];
  classification: string; account_required: boolean | null; payment_card_required: boolean | null; api_access: string;
  limits: { metric: string; value: number | string; unit: string; reset_period: string | null }[];
  license: string | null; embedding: string; redistribution: string; attribution_required: boolean | null; certificate: string | null;
  integration_method: string; status: "verified" | "pending"; evidence: { url: string; retrieved_at: string; claims: string[]; summary: string | null }[]; notes: string;
  level: string | null; est_hours: number | null; prerequisites: string[]; maps_to: { course: string; relation: string; topic: string }[];
}

export const ECO_CATALOG: CatalogSeed[] = [
 {
  "id": "zoom-basic",
  "name": "Zoom Workplace Basic",
  "provider": "Zoom",
  "official_url": "https://zoom.us/pricing",
  "category": "meeting",
  "subjects": [
   "virtual classroom",
   "communication"
  ],
  "description": "Free tier of Zoom's video meeting service with capped meeting length and attendance.",
  "use_cases": [
   "live lectures",
   "office hours",
   "small-group sessions"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "meeting_duration",
    "value": 40,
    "unit": "minutes",
    "reset_period": "per meeting"
   },
   {
    "metric": "participants",
    "value": 100,
    "unit": "participants",
    "reset_period": "per meeting"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://zoom.us/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Basic plan meetings capped at 40 minutes",
     "Basic plan up to 100 participants"
    ],
    "summary": "40 minutes per meeting"
   }
  ],
  "notes": "Account needed to host (not re-verified on fetched page beyond plan context). Payment card requirement not confirmed; API/SDK terms not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "webex-free",
  "name": "Webex Free",
  "provider": "Cisco Webex",
  "official_url": "https://pricing.webex.com/us/en/",
  "category": "meeting",
  "subjects": [
   "virtual classroom",
   "communication"
  ],
  "description": "Free tier of Cisco's Webex meetings service with a per-meeting time cap.",
  "use_cases": [
   "live lectures",
   "office hours"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "meeting_duration",
    "value": 40,
    "unit": "minutes",
    "reset_period": "per meeting"
   },
   {
    "metric": "participants",
    "value": 100,
    "unit": "attendees",
    "reset_period": "per meeting"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://pricing.webex.com/us/en/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Unlimited meetings up to 40 minutes each",
     "Up to 100 attendees per meeting"
    ],
    "summary": "Unlimited meetings, up to 40 min per meeting"
   }
  ],
  "notes": "Account requirement inferred from sign-up flow (redirect to signup.webex.com), not quoted. API terms not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "google-meet-free",
  "name": "Google Meet (free Google Account)",
  "provider": "Google",
  "official_url": "https://workspace.google.com/products/meet/",
  "category": "meeting",
  "subjects": [
   "virtual classroom",
   "communication"
  ],
  "description": "Video meetings available to anyone with a personal Google Account, with a time cap on group calls.",
  "use_cases": [
   "1:1 tutoring",
   "small-group sessions",
   "office hours"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "group_meeting_duration_3plus",
    "value": 60,
    "unit": "minutes",
    "reset_period": "per meeting"
   },
   {
    "metric": "one_to_one_duration",
    "value": "no time limit",
    "unit": "n/a",
    "reset_period": "per meeting"
   },
   {
    "metric": "participants",
    "value": 100,
    "unit": "participants",
    "reset_period": "per meeting"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://workspace.google.com/products/meet/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free: up to 100 participants",
     "Free: up to 60 minutes per meeting",
     "1:1 and mobile calls: no time limit",
     "Recording requires paid Workspace/Google One"
    ],
    "summary": "invite up to 100 participants, and meet for up to 60 minutes per meeting at no cost"
   }
  ],
  "notes": "Support article support.google.com/meet/answer/10317867 returned 404; claims taken from product page. Page says 60-min cap applies generally with exception for 1:1 and mobile calls; the '3+ participants' framing is an interpretation of 'group'. payment_card_required=false assumed from 'no cost' with Google Account - treat cautiously.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "jitsi-meet",
  "name": "Jitsi Meet / meet.jit.si",
  "provider": "8x8 / Jitsi community",
  "official_url": "https://jitsi.org/jitsi-meet/",
  "category": "meeting",
  "subjects": [
   "virtual classroom",
   "communication"
  ],
  "description": "Open-source video conferencing software that can be self-hosted, with a free public instance at meet.jit.si.",
  "use_cases": [
   "live lectures",
   "embedded classroom video",
   "self-hosted meetings"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/jitsi/jitsi-meet/blob/master/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under Apache License 2.0"
    ],
    "summary": "Apache License Version 2.0, January 2004"
   },
   {
    "url": "https://jitsi.org/jitsi-meet/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Open source",
     "Free to use",
     "No account needed (per marketing page)"
    ],
    "summary": "100% open source video conferencing solution that you can use all day, every day, for free"
   }
  ],
  "notes": "meet.jit.si direct fetch returned no content. Marketing page claims no account needed; the public instance may require moderator sign-in in practice - verify before relying. Embedding via IFrame API / JaaS not verified here; self-hosting costs are separate.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "bigbluebutton",
  "name": "BigBlueButton",
  "provider": "BigBlueButton Inc. / community",
  "official_url": "https://bigbluebutton.org/",
  "category": "meeting",
  "subjects": [
   "virtual classroom"
  ],
  "description": "Open-source web conferencing system designed for online teaching, intended to be self-hosted.",
  "use_cases": [
   "virtual classroom",
   "LMS-integrated live sessions",
   "breakout rooms"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "LGPL-3.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/bigbluebutton/bigbluebutton/blob/develop/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under LGPL v3"
    ],
    "summary": "GNU LESSER GENERAL PUBLIC LICENSE Version 3, 29 June 2007"
   }
  ],
  "notes": "Free software; server hosting and operations costs are separate. Embedding/API (BBB API) not verified on fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "ollama",
  "name": "Ollama",
  "provider": "Ollama",
  "official_url": "https://ollama.com/",
  "category": "ai_tool",
  "subjects": [
   "AI",
   "LLMs",
   "machine learning"
  ],
  "description": "Tool for downloading and running large language models locally on a personal computer or server.",
  "use_cases": [
   "local LLM labs",
   "offline AI demos",
   "agent backends"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/ollama/ollama/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under MIT"
    ],
    "summary": "MIT License"
   }
  ],
  "notes": "License covers the Ollama software only; individual models have their own licenses. Any Ollama cloud/hosted offering not checked. Local hardware costs separate.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "hugging-face-hub",
  "name": "Hugging Face Hub",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/pricing",
  "category": "ai_tool",
  "subjects": [
   "AI",
   "machine learning",
   "datasets"
  ],
  "description": "Platform for hosting and sharing models, datasets and demo apps, with free accounts and paid tiers for extra compute.",
  "use_cases": [
   "model/dataset discovery",
   "publishing student projects",
   "Spaces demos"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [
   {
    "metric": "inference_provider_credits_free_user",
    "value": 0.1,
    "unit": "USD",
    "reset_period": "monthly"
   },
   {
    "metric": "inference_provider_credits_pro_user",
    "value": 2.0,
    "unit": "USD",
    "reset_period": "monthly"
   },
   {
    "metric": "pro_plan_price",
    "value": 9,
    "unit": "USD",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "api",
  "status": "verified",
  "evidence": [
   {
    "url": "https://huggingface.co/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "PRO costs $9/month",
     "PRO includes 20x inference credits"
    ],
    "summary": "$9 /month"
   },
   {
    "url": "https://huggingface.co/docs/inference-providers/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free users get $0.10/month inference credits, subject to change",
     "Free users need to purchase credits for pay-as-you-go",
     "PRO users get $2.00/month"
    ],
    "summary": "Free Users | $0.10, subject to change"
   }
  ],
  "notes": "Hub browsing/hosting with a free account is free; Inference Providers API is credit-based (small free monthly credit, then paid). Free-account storage quotas not confirmed. Classification reflects inference credits; Hub itself is ongoing free.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "google-colab-free",
  "name": "Google Colab (free tier)",
  "provider": "Google",
  "official_url": "https://colab.research.google.com/",
  "category": "cloud_lab",
  "subjects": [
   "Python",
   "machine learning",
   "data science"
  ],
  "description": "Hosted Jupyter notebook service offering no-cost access to compute including GPUs and TPUs, subject to availability.",
  "use_cases": [
   "notebook labs",
   "ML assignments",
   "in-class demos"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "max_notebook_runtime",
    "value": 12,
    "unit": "hours",
    "reset_period": "per session"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://research.google.com/colaboratory/faq.html",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Colab is free of charge",
     "Free GPU/TPU access",
     "Resources not guaranteed; limits fluctuate and are unpublished",
     "Free notebooks run at most 12 hours"
    ],
    "summary": "Colab resources are not guaranteed and not unlimited, and usage limits sometimes fluctuate."
   }
  ],
  "notes": "GPU availability, memory and idle timeouts are not published and vary. Google Account required (assumed; not quoted). payment_card_required=false based on 'free of charge'.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "langgraph",
  "name": "LangGraph",
  "provider": "LangChain, Inc.",
  "official_url": "https://github.com/langchain-ai/langgraph",
  "category": "agentic_ai",
  "subjects": [
   "AI agents",
   "LLMs",
   "Python"
  ],
  "description": "Open-source library for building stateful, multi-step LLM agent workflows as graphs.",
  "use_cases": [
   "agent orchestration labs",
   "multi-agent demos"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/langchain-ai/langgraph/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under MIT"
    ],
    "summary": "MIT License"
   }
  ],
  "notes": "Library is free; LangGraph Platform/LangSmith hosted services and LLM API costs are separate and not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "crewai",
  "name": "CrewAI",
  "provider": "CrewAI Inc.",
  "official_url": "https://github.com/crewAIInc/crewAI",
  "category": "agentic_ai",
  "subjects": [
   "AI agents",
   "LLMs",
   "Python"
  ],
  "description": "Open-source Python framework for orchestrating role-based multi-agent LLM systems.",
  "use_cases": [
   "multi-agent labs",
   "agent design projects"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "pending",
  "evidence": [
   {
    "url": "https://github.com/crewAIInc/crewAI/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "LICENSE text is the standard MIT License"
    ],
    "summary": "Permission is hereby granted, free of charge, to any person obtaining a copy"
   }
  ],
  "notes": "License identified as MIT from LICENSE file text, but the quoted grant phrase is standard MIT wording not echoed verbatim by the fetch tool; re-confirm quote. Hosted CrewAI platform and LLM API costs separate.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "openai-whisper",
  "name": "Whisper (open-source)",
  "provider": "OpenAI",
  "official_url": "https://github.com/openai/whisper",
  "category": "audio",
  "subjects": [
   "speech recognition",
   "AI"
  ],
  "description": "Open-source speech recognition model and code that can be run locally for transcription and translation.",
  "use_cases": [
   "lecture transcription",
   "captioning",
   "speech AI labs"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/openai/whisper/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository code and weights licensed under MIT"
    ],
    "summary": "MIT License"
   }
  ],
  "notes": "Covers the open-source repo only; OpenAI's hosted transcription API is paid and separate (not checked). Local compute costs separate.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "elevenlabs-free",
  "name": "ElevenLabs Free plan",
  "provider": "ElevenLabs",
  "official_url": "https://elevenlabs.io/pricing",
  "category": "audio",
  "subjects": [
   "text-to-speech",
   "voice AI"
  ],
  "description": "Free tier of an AI voice platform for text-to-speech and related audio generation, with monthly credits and non-commercial terms.",
  "use_cases": [
   "narrated lesson audio (non-commercial)",
   "TTS demos"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "credits",
    "value": 10000,
    "unit": "credits",
    "reset_period": "monthly"
   },
   {
    "metric": "studio_projects",
    "value": 3,
    "unit": "projects",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://elevenlabs.io/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan includes 10k credits per month",
     "Free plan has no commercial license; Starter adds Commercial License"
    ],
    "summary": "10k credits per month"
   },
   {
    "url": "https://help.elevenlabs.io/hc/en-us/articles/13313564601361",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan cannot be used commercially",
     "Published free-plan content must credit elevenlabs.io or 11.ai in title"
    ],
    "summary": "The free plan does not include a commercial license and cannot be used for any commercial purpose."
   }
  ],
  "notes": "Pending: API availability on the free plan not confirmed on fetched pages (elevenlabs.io/pricing/api mentions 'Start for free' but no free quota). Credit-to-character conversion not confirmed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "heygen-free",
  "name": "HeyGen Free plan",
  "provider": "HeyGen",
  "official_url": "https://www.heygen.com/pricing",
  "category": "avatar",
  "subjects": [
   "AI video",
   "avatars"
  ],
  "description": "Free tier of an AI avatar video generator with a small monthly video allowance and watermarked output.",
  "use_cases": [
   "short avatar intro videos",
   "AI video demos"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [
   {
    "metric": "videos",
    "value": 3,
    "unit": "videos",
    "reset_period": "monthly"
   },
   {
    "metric": "max_video_length",
    "value": 1,
    "unit": "minutes",
    "reset_period": "per video"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.heygen.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free: 3 videos per month",
     "Free: up to 1 minute per video",
     "Free exports watermarked",
     "API not included on free plan"
    ],
    "summary": "3 videos per month"
   }
  ],
  "notes": "Pending: fetch summary reported the 1-minute length, watermark and no-API details but only '3 videos per month' was returned as an exact quote; re-verify wording. HeyGen API has separate pricing not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "d-id-trial",
  "name": "D-ID Studio free trial",
  "provider": "D-ID",
  "official_url": "https://www.d-id.com/pricing/",
  "category": "avatar",
  "subjects": [
   "AI video",
   "avatars"
  ],
  "description": "Trial access to a platform that generates talking-head avatar videos from images and text.",
  "use_cases": [
   "avatar video prototyping"
  ],
  "classification": "trial",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.d-id.com/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free trial offered via studio.d-id.com",
     "Trial users get a full-screen watermark"
    ],
    "summary": "a full-screen watermark appears for trial users"
   }
  ],
  "notes": "Pending: trial length, credits/minutes, card requirement and API trial terms not stated on fetched official pages.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "obs-studio",
  "name": "OBS Studio",
  "provider": "OBS Project",
  "official_url": "https://obsproject.com/",
  "category": "video",
  "subjects": [
   "video production",
   "streaming"
  ],
  "description": "Free open-source desktop software for screen recording and live streaming.",
  "use_cases": [
   "recording lectures",
   "live streaming classes"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "GPL-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/obsproject/obs-studio/blob/master/COPYING",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "COPYING file is GPL v2"
    ],
    "summary": "GNU GENERAL PUBLIC LICENSE Version 2, June 1991"
   }
  ],
  "notes": "COPYING shows GPL v2 text; project may be 'GPL-2.0-or-later' - not confirmed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "piper-tts",
  "name": "Piper TTS",
  "provider": "Open Home Foundation (OHF-Voice)",
  "official_url": "https://github.com/OHF-Voice/piper1-gpl",
  "category": "audio",
  "subjects": [
   "text-to-speech"
  ],
  "description": "Fast local neural text-to-speech engine that runs offline.",
  "use_cases": [
   "offline narration",
   "accessibility audio",
   "TTS labs"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "GPL-3.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/OHF-Voice/piper1-gpl",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Active repo licensed GPL-3.0"
    ],
    "summary": "GPL-3.0 license"
   },
   {
    "url": "https://github.com/rhasspy/piper/blob/master/LICENSE.md",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Original repo MIT",
     "Archived Oct 6, 2025, read-only"
    ],
    "summary": "This repository was archived by the owner on Oct 6, 2025. It is now read-only."
   }
  ],
  "notes": "Original rhasspy/piper (MIT) was archived Oct 6, 2025 (confirmed at https://github.com/rhasspy/piper/blob/master/LICENSE.md); active development is OHF-Voice/piper1-gpl under GPL-3.0. Successor relationship not explicitly stated on fetched page. Voice models have their own licenses.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "coqui-tts",
  "name": "Coqui TTS",
  "provider": "Coqui (community)",
  "official_url": "https://github.com/coqui-ai/TTS",
  "category": "audio",
  "subjects": [
   "text-to-speech",
   "voice AI"
  ],
  "description": "Open-source deep learning toolkit for text-to-speech and voice cloning.",
  "use_cases": [
   "TTS research labs",
   "voice synthesis demos"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MPL-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/coqui-ai/TTS/blob/dev/LICENSE.txt",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Code licensed under MPL 2.0"
    ],
    "summary": "Mozilla Public License Version 2.0"
   }
  ],
  "notes": "Code license only; pretrained models (e.g., XTTS) may carry separate, more restrictive licenses - not checked. Maintenance status of repo not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "excalidraw",
  "name": "Excalidraw",
  "provider": "Excalidraw",
  "official_url": "https://excalidraw.com/",
  "category": "reading",
  "subjects": [
   "diagramming",
   "whiteboard"
  ],
  "description": "Open-source virtual whiteboard for sketch-style diagrams, usable in the browser or embedded as a component.",
  "use_cases": [
   "concept diagrams",
   "collaborative whiteboarding",
   "architecture sketches"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "embed",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/excalidraw/excalidraw/blob/master/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under MIT"
    ],
    "summary": "MIT License"
   }
  ],
  "notes": "Category 'reading' used as closest fit for a study/instructional tool. Excalidraw+ paid tier not checked. Free web app at excalidraw.com.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "anki",
  "name": "Anki",
  "provider": "Ankitects",
  "official_url": "https://apps.ankiweb.net/",
  "category": "reading",
  "subjects": [
   "spaced repetition",
   "study skills"
  ],
  "description": "Open-source spaced-repetition flashcard application, free on desktop.",
  "use_cases": [
   "vocabulary/term review",
   "exam prep decks"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "AGPL-3.0-or-later",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/ankitects/anki/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed AGPL v3 or later (some parts BSD-3 / others)"
    ],
    "summary": "Anki is licensed under the GNU Affero General Public License, version 3 or later"
   },
   {
    "url": "https://apps.ankiweb.net/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free computer version for all major platforms",
     "AnkiMobile (iOS) purchases fund development"
    ],
    "summary": "The free computer version is available for all major platforms."
   }
  ],
  "notes": "Desktop is free; official iOS app AnkiMobile is paid (supports development). Category 'reading' used as closest fit.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "h5p",
  "name": "H5P",
  "provider": "H5P Group / community",
  "official_url": "https://h5p.org/",
  "category": "reading",
  "subjects": [
   "interactive content",
   "e-learning"
  ],
  "description": "Open-source framework for creating interactive HTML5 learning content such as quizzes and interactive videos.",
  "use_cases": [
   "interactive quizzes in LMS",
   "interactive video"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "MIT (most code); GPL-3.0 (PHP library)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "embed",
  "status": "verified",
  "evidence": [
   {
    "url": "https://h5p.org/licensing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "MIT where possible",
     "PHP library GPL due to third-party code",
     "h5p.org site content CC BY 4.0 unless stated"
    ],
    "summary": "H5P tries to use the MIT license wherever possible"
   },
   {
    "url": "https://github.com/h5p/h5p-php-library/blob/master/LICENSE.txt",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "PHP library licensed GPL v3"
    ],
    "summary": "GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007"
   }
  ],
  "notes": "Plugins available for Moodle/WordPress/Drupal; H5P.com hosted service is paid (not checked). Category 'reading' used as closest fit.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "mit-ocw",
  "name": "MIT OpenCourseWare",
  "provider": "MIT",
  "official_url": "https://ocw.mit.edu/",
  "category": "course",
  "subjects": [
   "computer science",
   "mathematics",
   "engineering",
   "multiple"
  ],
  "description": "Free online publication of materials from MIT courses, openly licensed for non-commercial reuse.",
  "use_cases": [
   "supplementary readings",
   "problem sets",
   "lecture videos"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ocw.mit.edu/pages/privacy-and-terms-of-use/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "CC BY-NC-SA 4.0",
     "Free to share and adapt non-commercially",
     "No commercial use"
    ],
    "summary": "You may not use the material for commercial purposes"
   }
  ],
  "notes": "Non-commercial restriction matters if the platform charges tuition - review before redistribution. Some third-party content in courses may be excluded from the license. Certificate 'none' inferred (no certificate offering on fetched page).",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "stanford-cs224n",
  "name": "Stanford CS224N: NLP with Deep Learning (public materials)",
  "provider": "Stanford University",
  "official_url": "https://web.stanford.edu/class/cs224n/",
  "category": "course",
  "subjects": [
   "NLP",
   "deep learning",
   "AI"
  ],
  "description": "Publicly posted slides, notes, assignments and lecture video links for Stanford's NLP with deep learning course.",
  "use_cases": [
   "NLP curriculum reference",
   "lecture videos",
   "assignment ideas"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://web.stanford.edu/class/cs224n/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Winter 2026 offering",
     "Slides and assignments online; anyone may use them, acknowledgement welcomed",
     "Free 2024 lecture videos on YouTube"
    ],
    "summary": "We are happy for anyone to use these resources, and we are happy to get acknowledgements."
   }
  ],
  "notes": "No formal license stated - informal permission only; redistribution/embedding rights unclear, so status pending. Certificate 'none' for public materials is an inference.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "openstax",
  "name": "OpenStax",
  "provider": "Rice University",
  "official_url": "https://openstax.org/",
  "category": "reading",
  "subjects": [
   "mathematics",
   "science",
   "computer science",
   "multiple"
  ],
  "description": "Nonprofit publisher of free, openly licensed college textbooks.",
  "use_cases": [
   "required course textbooks",
   "supplementary reading"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "CC BY-NC-SA (library-wide transition; older editions may be CC BY)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://openstax.org/license",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Library transitioned to CC BY-NC-SA for new and updated titles, limited exceptions"
    ],
    "summary": "transitioned our textbook library from a mix of CC BY and CC BY-NC-SA licensing to CC BY-NC-SA"
   },
   {
    "url": "https://openstax.org/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free college textbooks"
    ],
    "summary": "OpenStax offers free college textbooks for all types of students"
   }
  ],
  "notes": "Check each title's license page; older versions may remain CC BY. Non-commercial restriction applies to newer titles.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "reading"
 },
 {
  "id": "fastai-practical-deep-learning",
  "name": "Practical Deep Learning for Coders",
  "provider": "fast.ai",
  "official_url": "https://course.fast.ai/",
  "category": "course",
  "subjects": [
   "deep learning",
   "machine learning",
   "Python"
  ],
  "description": "Free course teaching practical deep learning to people with some coding experience, paired with a free online book.",
  "use_cases": [
   "self-paced DL course",
   "supplementary lectures"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://course.fast.ai/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Course is free",
     "Book freely available online"
    ],
    "summary": "A free course designed for people with some coding experience"
   }
  ],
  "notes": "No certificate info on page. License of course materials not stated on fetched page. account_required=false inferred from open site.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "hf-agents-course",
  "name": "Hugging Face Agents Course",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/learn/agents-course/unit0/introduction",
  "category": "course",
  "subjects": [
   "AI agents",
   "LLMs",
   "Python"
  ],
  "description": "Free online course on building AI agents with free certification on completion of required units.",
  "use_cases": [
   "agentic AI curriculum",
   "student certification"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://huggingface.co/learn/agents-course/unit0/introduction",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Course is free",
     "Certification is completely free",
     "Hugging Face account needed",
     "Fundamentals cert: Unit 1; completion cert: Unit 1 + assignment + final challenge"
    ],
    "summary": "The certification process is completely free."
   }
  ],
  "notes": "Certificate deadlines/availability may change; content license not checked. Some exercises may use inference credits.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "kaggle-learn",
  "name": "Kaggle Learn",
  "provider": "Kaggle (Google)",
  "official_url": "https://www.kaggle.com/learn",
  "category": "course",
  "subjects": [
   "Python",
   "data science",
   "machine learning"
  ],
  "description": "Short no-cost interactive courses on data science and machine learning topics run in Kaggle notebooks.",
  "use_cases": [
   "intro Python/ML practice",
   "micro-courses"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.kaggle.com/learn",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Courses are no-cost"
    ],
    "summary": "Practical data skills you can apply immediately: that's what you'll learn in these no-cost courses."
   }
  ],
  "notes": "Pending: certificate terms not confirmed (kaggle.com/learn-course-certificates returned only metadata). Account requirement not confirmed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "freecodecamp",
  "name": "freeCodeCamp",
  "provider": "freeCodeCamp.org",
  "official_url": "https://www.freecodecamp.org/",
  "category": "course",
  "subjects": [
   "web development",
   "Python",
   "JavaScript",
   "programming"
  ],
  "description": "Nonprofit platform offering free interactive coding curriculum, projects and certifications.",
  "use_cases": [
   "programming practice",
   "free certifications",
   "project-based learning"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.freecodecamp.org/news/about/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Everything including certifications is free",
     "Donor-supported 501(c)(3)"
    ],
    "summary": "Every aspect of freeCodeCamp is 100% free. The courses, the projects, even the certifications."
   }
  ],
  "notes": "Account required for earning certifications likely but not confirmed. Content license not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "deeplearning-ai-short-courses",
  "name": "DeepLearning.AI Short Courses",
  "provider": "DeepLearning.AI",
  "official_url": "https://www.deeplearning.ai/short-courses/",
  "category": "course",
  "subjects": [
   "generative AI",
   "AI agents",
   "LLMs"
  ],
  "description": "Catalog of short, hands-on courses on generative AI topics, with a paid membership tier also offered.",
  "use_cases": [
   "focused GenAI tutorials",
   "agentic AI topics"
  ],
  "classification": "unknown",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.deeplearning.ai/membership/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Paid Pro and Team membership exist",
     "Membership includes professional certificates and labs"
    ],
    "summary": "Team members get all the same benefits and features as Pro users"
   }
  ],
  "notes": "Pending: fetched official pages did not state whether short courses are currently free, or any beta/limited-time terms. Prices not shown.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "course"
 },
 {
  "id": "microsoft-teams-free",
  "name": "Microsoft Teams (free)",
  "provider": "Microsoft",
  "official_url": "https://www.microsoft.com/en-us/microsoft-teams/free",
  "category": "meeting",
  "subjects": [
   "all subjects"
  ],
  "description": "Free tier of Microsoft's chat and video meeting app for small groups.",
  "use_cases": [
   "live virtual class sessions",
   "office hours",
   "study-group chat"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "participants_per_meeting",
    "value": 100,
    "unit": "participants",
    "reset_period": null
   },
   {
    "metric": "group_meeting_duration",
    "value": 60,
    "unit": "minutes",
    "reset_period": "per_meeting"
   },
   {
    "metric": "one_to_one_call_duration",
    "value": 30,
    "unit": "hours",
    "reset_period": "per_call"
   },
   {
    "metric": "cloud_storage",
    "value": 5,
    "unit": "GB",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.microsoft.com/en-us/microsoft-teams/free",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Up to 100 participants per meeting",
     "Group meetings up to 60 minutes",
     "1:1 calls up to 30 hours",
     "5 GB cloud storage per user",
     "Teams Essentials paid upgrade exists"
    ],
    "summary": "Product page listing free Teams meeting caps, storage and a paid Essentials upgrade."
   }
  ],
  "notes": "Account requirement inferred from sign-in model, not explicitly stated on the fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "zoho-meeting-free",
  "name": "Zoho Meeting Free",
  "provider": "Zoho",
  "official_url": "https://www.zoho.com/meeting/",
  "category": "meeting",
  "subjects": [
   "all subjects"
  ],
  "description": "Browser-based video meeting service with a no-cost tier for short meetings.",
  "use_cases": [
   "short live lessons",
   "advising sessions",
   "whiteboard explanations"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "participants_per_meeting",
    "value": 100,
    "unit": "participants",
    "reset_period": null
   },
   {
    "metric": "meeting_duration",
    "value": 60,
    "unit": "minutes",
    "reset_period": "per_meeting"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.zoho.com/meeting/pricing.html",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan: up to 100 participants per meeting",
     "Free plan: up to 60 minutes per meeting",
     "Includes screen sharing, whiteboard, basic reports"
    ],
    "summary": "Pricing page comparing Zoho Meeting tiers, including a Free plan with participant and time caps."
   }
  ],
  "notes": "Account and card requirements not stated on the fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "whereby-free",
  "name": "Whereby Free",
  "provider": "Whereby",
  "official_url": "https://whereby.com/",
  "category": "meeting",
  "subjects": [
   "all subjects"
  ],
  "description": "Link-based browser video rooms with a small free tier.",
  "use_cases": [
   "one-to-one tutoring",
   "small-group check-ins"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "participants_per_meeting",
    "value": 4,
    "unit": "participants",
    "reset_period": null
   },
   {
    "metric": "meeting_duration",
    "value": 30,
    "unit": "minutes",
    "reset_period": "per_meeting"
   },
   {
    "metric": "room_urls",
    "value": 1,
    "unit": "rooms",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://whereby.com/information/meetings/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan: 4 attendees per meeting",
     "Meetings up to 30 minutes",
     "1 room URL"
    ],
    "summary": "Meetings pricing page listing a Free plan with attendee, duration and room caps."
   }
  ],
  "notes": "Whereby Embedded (developer API) is priced separately and was not checked; free plan suits only very small groups.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "loom-starter",
  "name": "Loom Starter",
  "provider": "Atlassian (Loom)",
  "official_url": "https://www.loom.com/",
  "category": "video",
  "subjects": [
   "all subjects"
  ],
  "description": "Screen and camera recorder with shareable video links; the Starter tier is free.",
  "use_cases": [
   "short lecture walkthroughs",
   "assignment feedback videos",
   "how-to demos"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "videos_per_person",
    "value": 25,
    "unit": "videos",
    "reset_period": null
   },
   {
    "metric": "screen_recording_length",
    "value": 5,
    "unit": "minutes",
    "reset_period": "per_video"
   },
   {
    "metric": "workspace_members",
    "value": 50,
    "unit": "members",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.loom.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Starter: 25 videos per person",
     "Starter: 5-minute screen recordings",
     "Up to 50 members",
     "Discounted plan for students/teachers via Atlassian education program"
    ],
    "summary": "Pricing page with free Starter caps and a pointer to an educator discount."
   }
  ],
  "notes": "Education offer described as discounted, not free. Loom embed support not confirmed on fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "clipchamp-free",
  "name": "Clipchamp (free plan)",
  "provider": "Microsoft",
  "official_url": "https://clipchamp.com/",
  "category": "video",
  "subjects": [
   "all subjects",
   "media production"
  ],
  "description": "Browser and Windows video editor whose free plan exports watermark-free HD video.",
  "use_cases": [
   "editing recorded lectures",
   "student video projects",
   "auto-subtitled clips"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "max_export_resolution",
    "value": 1080,
    "unit": "p",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://clipchamp.com/en/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan exports up to 1080p",
     "Watermark-free exports",
     "Free stock assets",
     "Basic AI features such as subtitles and voiceover",
     "Content backup on OneDrive"
    ],
    "summary": "Pricing page describing the free plan's export quality, stock media and AI tools."
   }
  ],
  "notes": "Account requirement inferred (OneDrive backup); not explicitly stated. Premium stock is paid.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "capcut-free",
  "name": "CapCut (free)",
  "provider": "ByteDance (CapCut)",
  "official_url": "https://www.capcut.com/",
  "category": "video",
  "subjects": [
   "media production"
  ],
  "description": "Online and desktop video editor promoted as free to try without a card.",
  "use_cases": [
   "short-form video assignments",
   "quick edits"
  ],
  "classification": "unknown",
  "account_required": null,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.capcut.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "'Try online for free'",
     "'No credit card required'"
    ],
    "summary": "Homepage promotes a free online editor but gives no free-tier limits."
   },
   {
    "url": "https://www.capcut.com/help/how-much-does-capcut-pro-cost",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Paid monthly and yearly subscriptions exist"
    ],
    "summary": "Help article on Pro pricing; no free-tier limits listed."
   }
  ],
  "notes": "Free-tier limits (export, storage, watermark) and whether 'free' is ongoing or trial not confirmed. /pricing returned 404. Review privacy terms before student use.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "canva-free",
  "name": "Canva Free",
  "provider": "Canva",
  "official_url": "https://www.canva.com/",
  "category": "video",
  "subjects": [
   "all subjects",
   "design"
  ],
  "description": "Drag-and-drop design and video tool with a no-cost plan.",
  "use_cases": [
   "slides and posters",
   "simple video edits",
   "infographics"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "cloud_storage",
    "value": 5,
    "unit": "GB",
    "reset_period": null
   },
   {
    "metric": "ai_uses",
    "value": 20,
    "unit": "uses",
    "reset_period": null
   },
   {
    "metric": "brand_kits",
    "value": 1,
    "unit": "kits",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.canva.com/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free: 5GB cloud storage",
     "Up to 20 Standard or Premium AI uses",
     "1 Brand Kit (3 colors)",
     "1.6M+ templates"
    ],
    "summary": "Pricing page listing Canva Free features and quotas."
   }
  ],
  "notes": "Reset period for the 20 AI uses not stated. Account requirement inferred.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "canva-for-education",
  "name": "Canva for Education",
  "provider": "Canva",
  "official_url": "https://www.canva.com/education/",
  "category": "video",
  "subjects": [
   "all subjects",
   "design"
  ],
  "description": "Premium Canva features at no cost for eligible K-12 teachers, students and schools.",
  "use_cases": [
   "class design projects",
   "teacher-made materials",
   "student video presentations"
  ],
  "classification": "education_benefit",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.canva.com/education/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "100% free for K-12 educators, their students and qualified schools/districts",
     "Higher education is served by separate Canva Campus offering"
    ],
    "summary": "Education page stating free K-12 access and pointing universities to Canva Campus."
   }
  ],
  "notes": "NOT free for higher-ed (Canva Campus is separate); eligibility verification required. A college-level platform likely does not qualify.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "youtube-hosting",
  "name": "YouTube (video hosting)",
  "provider": "Google",
  "official_url": "https://www.youtube.com/",
  "category": "video",
  "subjects": [
   "all subjects"
  ],
  "description": "Free video hosting and streaming platform usable for course videos.",
  "use_cases": [
   "hosting lecture recordings",
   "unlisted course videos",
   "playlists per module"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "default_upload_length",
    "value": 15,
    "unit": "minutes",
    "reset_period": "per_video"
   },
   {
    "metric": "max_upload_size",
    "value": 256,
    "unit": "GB",
    "reset_period": "per_video"
   },
   {
    "metric": "max_upload_length_verified",
    "value": 12,
    "unit": "hours",
    "reset_period": "per_video"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "embed",
  "status": "pending",
  "evidence": [
   {
    "url": "https://support.google.com/youtube/answer/71673",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Default uploads up to 15 minutes",
     "Verified accounts can upload longer",
     "Max 256 GB or 12 hours, whichever is less"
    ],
    "summary": "Help article on upload length and size caps and phone verification."
   }
  ],
  "notes": "Embedding is common but embed terms were not fetched, so embedding left unknown. Free-of-charge status not stated on fetched page; classification based on the product model, verify if strict.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "kdenlive",
  "name": "Kdenlive",
  "provider": "KDE",
  "official_url": "https://kdenlive.org/",
  "category": "video",
  "subjects": [
   "media production"
  ],
  "description": "Open-source non-linear video editor from the KDE community.",
  "use_cases": [
   "editing lecture recordings",
   "student media projects"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "GNU GPL (docs: GNU FDL)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://kdenlive.org/en/about/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free Software under the GNU GPL",
     "Website docs under GNU FDL",
     "Runs on GNU/Linux, BSD, macOS"
    ],
    "summary": "About page stating GPL licensing and supported platforms."
   }
  ],
  "notes": "About page appears outdated (says Windows port in progress); GPL version not specified there.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "shotcut",
  "name": "Shotcut",
  "provider": "Meltytech, LLC",
  "official_url": "https://www.shotcut.org/",
  "category": "video",
  "subjects": [
   "media production"
  ],
  "description": "Free, open-source cross-platform video editor.",
  "use_cases": [
   "editing lecture recordings",
   "student video assignments"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "GPL-3.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.shotcut.org/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free, open source, cross-platform",
     "Windows, Mac and Linux"
    ],
    "summary": "Homepage describing Shotcut as free open-source editor for three OSes."
   },
   {
    "url": "https://github.com/mltframework/shotcut",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed GPLv3"
    ],
    "summary": "Repository README states GPLv3, see COPYING."
   }
  ],
  "notes": "",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "audacity",
  "name": "Audacity",
  "provider": "Audacity Team (Muse Group)",
  "official_url": "https://www.audacityteam.org/",
  "category": "audio",
  "subjects": [
   "media production",
   "music",
   "languages"
  ],
  "description": "Open-source multi-track audio recorder and editor.",
  "use_cases": [
   "recording narration",
   "podcast editing",
   "language listening clips"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "GPL-3.0 (most code GPLv2-or-later; docs CC BY 3.0)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.audacityteam.org/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free for everyone",
     "Open source",
     "Windows, macOS, Linux"
    ],
    "summary": "Homepage stating Audacity is free, open source and cross-platform."
   },
   {
    "url": "https://github.com/audacity/audacity",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed GPLv3",
     "Most code GPLv2-or-later",
     "Docs CC-by 3.0"
    ],
    "summary": "Repository README describing code and documentation licensing."
   }
  ],
  "notes": "Optional cloud features (audio.com) not reviewed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "riverside-free",
  "name": "Riverside Free",
  "provider": "Riverside.fm",
  "official_url": "https://riverside.com/",
  "category": "audio",
  "subjects": [
   "media production"
  ],
  "description": "Remote recording studio for podcasts and video with a free tier.",
  "use_cases": [
   "remote guest interviews",
   "recorded lectures",
   "student podcasts"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "multitrack_recording",
    "value": 2,
    "unit": "hours",
    "reset_period": null
   },
   {
    "metric": "max_video_export_resolution",
    "value": 720,
    "unit": "p",
    "reset_period": null
   },
   {
    "metric": "audio_sample_rate",
    "value": 44.1,
    "unit": "kHz",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://riverside.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free: try 2 hours of multi-track recording",
     "Unlimited single-track recording/editing",
     "Up to 720p",
     "Riverside watermark",
     "44.1 kHz audio"
    ],
    "summary": "Pricing page listing free plan recording, quality and watermark terms."
   }
  ],
  "notes": "Whether the 2 multi-track hours are one-time or recurring is unclear ('Try'). Free exports watermarked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "spotify-for-creators",
  "name": "Spotify for Creators",
  "provider": "Spotify",
  "official_url": "https://creators.spotify.com/",
  "category": "audio",
  "subjects": [
   "media production",
   "all subjects"
  ],
  "description": "Spotify's free platform for hosting and publishing audio and video podcasts.",
  "use_cases": [
   "course podcast series",
   "student podcast projects"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "max_episode_duration",
    "value": 12,
    "unit": "hours",
    "reset_period": "per_episode"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "feed",
  "status": "verified",
  "evidence": [
   {
    "url": "https://creators.spotify.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free audio and video podcasting platform",
     "Video upload supported"
    ],
    "summary": "Homepage describing a free podcast hosting platform for audio and video."
   },
   {
    "url": "https://support.spotify.com/us/creators/article/publishing-videos/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "No file size limit",
     "Video max 12 hours",
     "MOV, MPG, MP4"
    ],
    "summary": "Support article on video formats and length cap."
   },
   {
    "url": "https://support.spotify.com/creators/article/12584546836507",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "No file size limit for audio"
    ],
    "summary": "Support article on publishing audio episodes."
   }
  ],
  "notes": "Integration via RSS feed assumed from podcast model; RSS not confirmed on fetched pages.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "kaggle-notebooks",
  "name": "Kaggle Notebooks",
  "provider": "Kaggle (Google)",
  "official_url": "https://www.kaggle.com/code",
  "category": "cloud_lab",
  "subjects": [
   "machine learning",
   "data science",
   "python"
  ],
  "description": "Hosted Jupyter-style notebooks with free CPU and accelerator time.",
  "use_cases": [
   "ML labs",
   "dataset exploration",
   "competition practice"
  ],
  "classification": "unknown",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.kaggle.com/docs/notebooks",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [],
    "summary": "Page is client-rendered; no quota text was returned by the fetch."
   }
  ],
  "notes": "Could not retrieve GPU/TPU weekly quotas or session limits from official docs (JS-rendered; direct access blocked). Re-check manually.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "hugging-face-spaces",
  "name": "Hugging Face Spaces",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/spaces",
  "category": "cloud_lab",
  "subjects": [
   "machine learning",
   "ai"
  ],
  "description": "Hosting for ML demo apps (Gradio, Docker, static) on Hugging Face.",
  "use_cases": [
   "publishing model demos",
   "student ML portfolios"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "cpu_basic_vcpu",
    "value": 2,
    "unit": "vCPU",
    "reset_period": null
   },
   {
    "metric": "cpu_basic_ram",
    "value": 16,
    "unit": "GB",
    "reset_period": null
   },
   {
    "metric": "cpu_basic_disk",
    "value": 50,
    "unit": "GB",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "embed",
  "status": "pending",
  "evidence": [
   {
    "url": "https://huggingface.co/docs/hub/spaces-overview",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Default free hardware 2 CPU cores, 16GB RAM, 50GB non-persistent disk",
     "Free Spaces sleep when unused"
    ],
    "summary": "Overview doc on default hardware and sleep behavior."
   },
   {
    "url": "https://huggingface.co/docs/hub/spaces-gpus",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "CPU Basic: 2 vCPU, 16 GB, 50 GB, free",
     "Creating a new compute Space (Gradio/Docker) requires a paid plan",
     "Static Spaces free for everyone"
    ],
    "summary": "Hardware doc listing CPU Basic as free but stating new compute Spaces need a paid plan."
   }
  ],
  "notes": "Docs conflict: overview implies free compute Spaces, hardware page says new Gradio/Docker Spaces require a paid plan; only static Spaces clearly free. Embedding marked allowed is NOT confirmed - treat as unknown.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "github-codespaces",
  "name": "GitHub Codespaces",
  "provider": "GitHub (Microsoft)",
  "official_url": "https://github.com/features/codespaces",
  "category": "cloud_lab",
  "subjects": [
   "programming",
   "python",
   "web development"
  ],
  "description": "Cloud-hosted VS Code dev environments with monthly included usage on personal accounts.",
  "use_cases": [
   "zero-install coding labs",
   "assignment starter repos"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "compute_time_free_personal",
    "value": 120,
    "unit": "hours",
    "reset_period": "monthly"
   },
   {
    "metric": "storage_free_personal",
    "value": 15,
    "unit": "GB-month",
    "reset_period": "monthly"
   },
   {
    "metric": "compute_time_pro",
    "value": 180,
    "unit": "hours",
    "reset_period": "monthly"
   },
   {
    "metric": "storage_pro",
    "value": 20,
    "unit": "GB-month",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://docs.github.com/en/billing/concepts/product-billing/github-codespaces",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "GitHub Free personal: 15 GB-month storage, 120 hrs compute",
     "GitHub Pro: 20 GB-month, 180 hrs",
     "No payment method needed; usage blocked once quota used"
    ],
    "summary": "Billing doc listing included monthly Codespaces quota per plan."
   }
  ],
  "notes": "GitHub counts compute in core hours (larger machines consume faster) - confirm unit; quota applies to personal accounts, not organizations.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "replit-starter",
  "name": "Replit Starter",
  "provider": "Replit",
  "official_url": "https://replit.com/",
  "category": "cloud_lab",
  "subjects": [
   "programming",
   "web development"
  ],
  "description": "Browser IDE and AI app builder with a free Starter plan.",
  "use_cases": [
   "quick coding exercises",
   "publishing a small demo app"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "published_apps",
    "value": 1,
    "unit": "apps",
    "reset_period": null
   },
   {
    "metric": "free_published_app_lifetime",
    "value": 30,
    "unit": "days",
    "reset_period": null
   },
   {
    "metric": "workspace_storage",
    "value": 2,
    "unit": "GB",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://docs.replit.com/billing/plans/starter-plan",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Daily Agent credits up to a monthly cap",
     "One free published app, taken down after 30 days",
     "2GB workspace storage",
     "Lite build only"
    ],
    "summary": "Docs page describing Starter plan allowances and restrictions."
   },
   {
    "url": "https://replit.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Core plan $20/month"
    ],
    "summary": "Pricing page focused on paid Core plan."
   }
  ],
  "notes": "Exact daily/monthly Agent credit amounts not stated.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "project-jupyter",
  "name": "Project Jupyter (JupyterLab/Notebook)",
  "provider": "Project Jupyter",
  "official_url": "https://jupyter.org/",
  "category": "cloud_lab",
  "subjects": [
   "python",
   "data science",
   "machine learning"
  ],
  "description": "Open-source interactive notebook environment for code, text and output.",
  "use_cases": [
   "local or self-hosted notebooks",
   "JupyterHub for classes"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "BSD-3-Clause",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://jupyter.org/about",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "100% open source, free for all",
     "Modified BSD license"
    ],
    "summary": "About page committing Jupyter to open source under modified BSD."
   }
  ],
  "notes": "Software is free; hosting (e.g., JupyterHub servers) is not.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "google-ai-studio",
  "name": "Google AI Studio / Gemini API free tier",
  "provider": "Google",
  "official_url": "https://aistudio.google.com/",
  "category": "ai_tool",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Google's web studio and API for Gemini models with a free tier for some models.",
  "use_cases": [
   "prompt prototyping",
   "student API projects"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "api",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ai.google.dev/gemini-api/docs/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free tier: limited access to certain models, free tokens",
     "Free tier includes AI Studio access",
     "Free-tier content used to improve products; paid tier not"
    ],
    "summary": "Pricing page comparing free and paid tiers incl. data-use differences."
   },
   {
    "url": "https://ai.google.dev/gemini-api/docs/rate-limits",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Limits per project",
     "RPD resets at midnight Pacific",
     "Specific limits shown in AI Studio dashboard"
    ],
    "summary": "Rate-limit doc explaining mechanics; no fixed numbers listed."
   }
  ],
  "notes": "PRIVACY: free-tier prompts/outputs may be used to improve Google products - avoid student personal data. Numeric free rate limits not published on fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "lm-studio",
  "name": "LM Studio",
  "provider": "Element Labs (LM Studio)",
  "official_url": "https://lmstudio.ai/",
  "category": "ai_tool",
  "subjects": [
   "ai",
   "machine learning"
  ],
  "description": "Desktop app for downloading and running open LLMs locally.",
  "use_cases": [
   "offline LLM demos",
   "local model comparison labs"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://lmstudio.ai/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Local LLM use at $0",
     "Paid Bionic+ ($20/mo) and Pro ($100/mo) hosted tiers"
    ],
    "summary": "Pricing page with free local use and paid hosted-model tiers."
   },
   {
    "url": "https://lmstudio.ai/blog/free-for-work",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free for work use without a form (July 8, 2025)"
    ],
    "summary": "Blog post announcing workplace use no longer needs a commercial license."
   }
  ],
  "notes": "App is not confirmed open source. api_access 'free' refers to its local OpenAI-compatible server - not confirmed on fetched pages; hosted tiers are paid.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "langchain",
  "name": "LangChain",
  "provider": "LangChain, Inc.",
  "official_url": "https://github.com/langchain-ai/langchain",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open-source framework for building LLM-powered apps and agents.",
  "use_cases": [
   "agent labs",
   "RAG pipelines"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/langchain-ai/langchain/blob/master/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "MIT License",
     "Copyright (c) LangChain, Inc."
    ],
    "summary": "License file showing MIT terms."
   }
  ],
  "notes": "Library is free; LangSmith and model APIs are separate paid/limited services.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "llamaindex",
  "name": "LlamaIndex",
  "provider": "LlamaIndex (run-llama)",
  "official_url": "https://github.com/run-llama/llama_index",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open-source framework for connecting LLMs to data (indexing, retrieval, agents).",
  "use_cases": [
   "RAG labs",
   "document Q&A projects"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/run-llama/llama_index/blob/main/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "MIT License",
     "Copyright (c) Jerry Liu"
    ],
    "summary": "License file showing MIT terms."
   }
  ],
  "notes": "Hosted LlamaCloud services not reviewed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "microsoft-autogen",
  "name": "Microsoft AutoGen",
  "provider": "Microsoft",
  "official_url": "https://github.com/microsoft/autogen",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open-source framework for multi-agent LLM applications, now in maintenance mode.",
  "use_cases": [
   "multi-agent demos",
   "historic comparison with newer frameworks"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT (code); CC BY 4.0 (docs)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/microsoft/autogen",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Code under MIT, docs under CC BY 4.0",
     "In maintenance mode, no new features",
     "New users pointed to Microsoft Agent Framework"
    ],
    "summary": "Repo README with dual licensing and maintenance-mode notice."
   }
  ],
  "notes": "Maintenance mode - consider Microsoft Agent Framework for new courses.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "model-context-protocol",
  "name": "Model Context Protocol (MCP)",
  "provider": "MCP project (originated at Anthropic)",
  "official_url": "https://modelcontextprotocol.io/",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open protocol and spec for connecting AI apps to tools and data sources.",
  "use_cases": [
   "teaching tool-calling",
   "building MCP servers in labs"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/modelcontextprotocol/modelcontextprotocol",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Spec and docs repository licensed MIT"
    ],
    "summary": "Spec repository README stating MIT license."
   }
  ],
  "notes": "License confirmed for the spec repo only; SDK repos not individually checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "chroma",
  "name": "Chroma",
  "provider": "Chroma",
  "official_url": "https://www.trychroma.com/",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open-source embedding/vector database for AI retrieval.",
  "use_cases": [
   "vector search labs",
   "RAG backends"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/chroma-core/chroma",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Apache 2.0 license",
     "Chroma Cloud offers $5 free credits"
    ],
    "summary": "Repo README with license and hosted cloud credit note."
   }
  ],
  "notes": "Self-hosted is free; Chroma Cloud is a separate credit-based service ($5 starter credit).",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "faiss",
  "name": "FAISS",
  "provider": "Meta (facebookresearch)",
  "official_url": "https://github.com/facebookresearch/faiss",
  "category": "agentic_ai",
  "subjects": [
   "ai",
   "programming"
  ],
  "description": "Open-source library for efficient similarity search over dense vectors.",
  "use_cases": [
   "nearest-neighbor search labs",
   "embedding retrieval"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/facebookresearch/faiss",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "MIT-licensed",
     "Copyright Meta Platforms, Inc."
    ],
    "summary": "Repo README stating MIT license."
   }
  ],
  "notes": "",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "google-forms",
  "name": "Google Forms",
  "provider": "Google",
  "official_url": "https://workspace.google.com/products/forms/",
  "category": "reading",
  "subjects": [
   "all subjects"
  ],
  "description": "Online form and quiz builder from Google.",
  "use_cases": [
   "self-graded quizzes",
   "surveys",
   "exit tickets"
  ],
  "classification": "unknown",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://workspace.google.com/products/forms/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Sign-in and 'Try Forms for work' offered"
    ],
    "summary": "Product page with no explicit free-use statement."
   },
   {
    "url": "https://support.google.com/docs/answer/6281888",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Create forms at forms.google.com"
    ],
    "summary": "Help article on creating forms; no pricing statement."
   }
  ],
  "notes": "No fetched official page explicitly states Forms is free with a personal account.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "microsoft-forms",
  "name": "Microsoft Forms",
  "provider": "Microsoft",
  "official_url": "https://forms.microsoft.com/",
  "category": "reading",
  "subjects": [
   "all subjects"
  ],
  "description": "Survey, quiz and poll builder available with a Microsoft account.",
  "use_cases": [
   "auto-graded quizzes",
   "polls",
   "course feedback"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://support.microsoft.com/en-us/office/what-is-microsoft-forms-6b391205-523c-45d2-b53a-fc10b22017c8",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Available to users with a Microsoft account (Hotmail, Live, Outlook.com)",
     "Also for Office 365 Education and Microsoft 365 business customers"
    ],
    "summary": "Support article listing who can use Forms, including free consumer accounts."
   }
  ],
  "notes": "Service-limits page returned 404; limits on forms/responses not recorded.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "miro-free",
  "name": "Miro Free",
  "provider": "Miro",
  "official_url": "https://miro.com/",
  "category": "reading",
  "subjects": [
   "all subjects"
  ],
  "description": "Online collaborative whiteboard with a free plan and an education plan.",
  "use_cases": [
   "brainstorming",
   "concept mapping",
   "group design activities"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "editable_boards",
    "value": 3,
    "unit": "boards",
    "reset_period": null
   },
   {
    "metric": "ai_credits",
    "value": 10,
    "unit": "credits",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://miro.com/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free: 3 editable boards (most recent)",
     "Unlimited members on Free",
     "10 AI credits per month",
     "Free Education Plan for accredited institutions' students and staff"
    ],
    "summary": "Pricing page with free plan caps and an education plan note."
   }
  ],
  "notes": "Education Plan (free for accredited institutions) requires eligibility verification; not separately recorded.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "kahoot-go",
  "name": "Kahoot! Go (free)",
  "provider": "Kahoot!",
  "official_url": "https://kahoot.com/",
  "category": "reading",
  "subjects": [
   "all subjects"
  ],
  "description": "Game-based quiz platform with a free teacher plan.",
  "use_cases": [
   "live review games",
   "formative checks"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "participants_per_game",
    "value": 50,
    "unit": "participants",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://kahoot.com/schools-u/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan named Kahoot! Go",
     "Participant limit: 50",
     "Reports and basic question types included"
    ],
    "summary": "Schools page describing the free Kahoot! Go plan and its participant cap."
   }
  ],
  "notes": "",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "nvda",
  "name": "NVDA screen reader",
  "provider": "NV Access",
  "official_url": "https://www.nvaccess.org/",
  "category": "reading",
  "subjects": [
   "accessibility"
  ],
  "description": "Free, open-source screen reader for Windows.",
  "use_cases": [
   "accessibility testing of course pages",
   "assistive tech for blind learners"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "GPL-2.0-or-later (modified)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.nvaccess.org/about-nvda/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "100% free to use globally",
     "Open source",
     "Windows 10/11 64-bit"
    ],
    "summary": "About page describing free, open-source Windows screen reader."
   },
   {
    "url": "https://github.com/nvaccess/nvda",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Modified GNU GPL v2 or later"
    ],
    "summary": "Repo README stating license."
   }
  ],
  "notes": "",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "webaim-wave",
  "name": "WAVE accessibility evaluation tools",
  "provider": "WebAIM (Utah State University)",
  "official_url": "https://wave.webaim.org/",
  "category": "reading",
  "subjects": [
   "accessibility",
   "web development"
  ],
  "description": "Web accessibility checker available online, as browser extensions, and as a paid API.",
  "use_cases": [
   "checking course pages for accessibility",
   "teaching WCAG"
  ],
  "classification": "limited_credits",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "paid",
  "limits": [
   {
    "metric": "api_free_credits_new_account",
    "value": 100,
    "unit": "credits",
    "reset_period": "one_time"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://wave.webaim.org/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Online tool and Chrome/Firefox/Edge extensions available",
     "Subscription and stand-alone API offerings"
    ],
    "summary": "Homepage listing WAVE tool formats."
   },
   {
    "url": "https://wave.webaim.org/extension/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Extension sends no information to WAVE server"
    ],
    "summary": "Extension page emphasizing local, private evaluation."
   },
   {
    "url": "https://wave.webaim.org/api/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "New accounts get 100 free credits",
     "1 credit per basic page",
     "$0.025-$0.04 per credit"
    ],
    "summary": "API page with credit pricing and starter credits."
   }
  ],
  "notes": "Fetched pages do not explicitly state the online checker/extension are free of charge; API is credit-based. Privacy: extension evaluates locally.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "otter-basic",
  "name": "Otter.ai Basic",
  "provider": "Otter.ai",
  "official_url": "https://otter.ai/",
  "category": "reading",
  "subjects": [
   "all subjects",
   "accessibility"
  ],
  "description": "AI meeting transcription service with a free Basic plan.",
  "use_cases": [
   "lecture transcripts",
   "captions for accessibility"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "transcription_minutes",
    "value": 300,
    "unit": "minutes",
    "reset_period": "monthly"
   },
   {
    "metric": "max_minutes_per_conversation",
    "value": 30,
    "unit": "minutes",
    "reset_period": "per_conversation"
   },
   {
    "metric": "file_imports",
    "value": 3,
    "unit": "imports",
    "reset_period": "lifetime"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://otter.ai/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Basic: 300 monthly transcription minutes",
     "30 minutes max per conversation",
     "3 lifetime file imports"
    ],
    "summary": "Pricing page listing Basic plan transcription caps."
   }
  ],
  "notes": "Privacy/AI-training terms not reviewed; check before recording students.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [],
  "kind": "tool"
 },
 {
  "id": "google-ml-crash-course",
  "name": "Machine Learning Crash Course",
  "provider": "Google for Developers",
  "official_url": "https://developers.google.com/machine-learning/crash-course",
  "category": "course",
  "subjects": [
   "machine learning",
   "neural networks",
   "embeddings",
   "LLMs",
   "ML fairness"
  ],
  "description": "Modular introduction to core ML concepts from linear and logistic regression through neural networks, embeddings, LLMs and production ML.",
  "use_cases": [
   "intro ML module readings",
   "self-paced review"
  ],
  "classification": "unknown",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY 4.0 (text), Apache 2.0 (code samples) - Google Developers site default, not seen on course page",
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": true,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://developers.google.com/machine-learning/crash-course",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Modules: Linear/Logistic Regression, Classification, Data, Neural Networks, Embeddings, Intro to LLMs, Production ML, AutoML, ML Fairness",
     "Page offers Google sign-in"
    ],
    "summary": "Course landing page listing module structure; no explicit free, duration, certificate or license statement extracted."
   },
   {
    "url": "https://developers.google.com/terms/site-policies",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Default: content licensed under CC BY 4.0 except as otherwise noted; code samples Apache 2.0"
    ],
    "summary": "Google Developers site policy giving the default content and code-sample licenses."
   }
  ],
  "notes": "Fetched course page did not state 'free', duration, certificate or a page-level license footer; license recorded only as site default.",
  "level": "mixed",
  "est_hours": null,
  "prerequisites": [
   "see course prerequisites page"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "Supervised learning foundations"
   }
  ],
  "kind": "course"
 },
 {
  "id": "hf-llm-course",
  "name": "Hugging Face LLM Course",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/learn/llm-course/chapter1/1",
  "category": "course",
  "subjects": [
   "LLMs",
   "transformers",
   "NLP",
   "fine-tuning"
  ],
  "description": "Chapter-based course on using and fine-tuning transformer language models with the Hugging Face ecosystem.",
  "use_cases": [
   "NLP/LLM module",
   "transformer labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "Apache 2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://huggingface.co/learn/llm-course/chapter1/1",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Completely free and without ads",
     "Released under Apache 2 license; attribution and license link required",
     "No certification currently",
     "About 1 week per chapter, 6-8 hours/week",
     "Strong Python required; intro DL course recommended"
    ],
    "summary": "Introduction page confirming free access, Apache 2.0 license, no current certificate, and weekly workload."
   }
  ],
  "notes": "Successor of the former Hugging Face NLP course. account_required inferred false since reading needs no login stated; HF account only needed for hub exercises.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "strong Python",
   "intro deep learning recommended"
  ],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Recommended",
    "topic": "Transformers and LLMs"
   },
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "NLP with transformers"
   }
  ],
  "kind": "course"
 },
 {
  "id": "hf-deep-rl-course",
  "name": "Hugging Face Deep Reinforcement Learning Course",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/learn/deep-rl-course/unit0/introduction",
  "category": "course",
  "subjects": [
   "reinforcement learning",
   "deep RL"
  ],
  "description": "Hands-on course on deep reinforcement learning with agents trained in simulated environments and shared on the Hugging Face Hub.",
  "use_cases": [
   "RL module labs",
   "agent training projects"
  ],
  "classification": "open_resource",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://huggingface.co/learn/deep-rl-course/unit0/introduction",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Completely free and open-source",
     "Free certificate of completion at 80% of assignments; honors at 100%",
     "About 3-4 hours/week per chapter, self-paced",
     "Requires free Hugging Face account and Google Colab"
    ],
    "summary": "Course intro confirming free access, free certificates, workload and account needs."
   },
   {
    "url": "https://github.com/huggingface/deep-rl-class",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository licensed Apache-2.0"
    ],
    "summary": "Official course repository showing Apache-2.0 license."
   }
  ],
  "notes": "",
  "level": "mixed",
  "est_hours": null,
  "prerequisites": [
   "Python"
  ],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Recommended",
    "topic": "Reinforcement learning"
   },
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Reinforcement learning"
   }
  ],
  "kind": "course"
 },
 {
  "id": "hf-mcp-course",
  "name": "Hugging Face Model Context Protocol (MCP) Course",
  "provider": "Hugging Face",
  "official_url": "https://huggingface.co/learn/mcp-course/unit0/introduction",
  "category": "course",
  "subjects": [
   "MCP",
   "agentic AI",
   "tool integration"
  ],
  "description": "Course on the Model Context Protocol for connecting LLM applications to tools and data, with hands-on projects.",
  "use_cases": [
   "agent tooling module",
   "MCP server labs"
  ],
  "classification": "open_resource",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://huggingface.co/learn/mcp-course/unit0/introduction",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Course is free; certification completely free",
     "Fundamentals certificate (Unit 1) and completion certificate (Units 2-3)",
     "About 3-4 hours/week per chapter",
     "Account required to access resources"
    ],
    "summary": "Course intro confirming free access, free certificates, prerequisites and workload."
   },
   {
    "url": "https://github.com/huggingface/mcp-course",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository licensed Apache-2.0"
    ],
    "summary": "Official course repository showing Apache-2.0 license."
   }
  ],
  "notes": "",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "basic AI/LLM understanding",
   "Python or TypeScript"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Model Context Protocol"
   },
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "Tool-using agents"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ms-generative-ai-for-beginners",
  "name": "Generative AI for Beginners",
  "provider": "Microsoft",
  "official_url": "https://github.com/microsoft/generative-ai-for-beginners",
  "category": "course",
  "subjects": [
   "generative AI",
   "LLMs",
   "RAG",
   "agents",
   "fine-tuning"
  ],
  "description": "Open curriculum of lessons on building generative AI applications, from prompting to RAG, agents and fine-tuning.",
  "use_cases": [
   "GenAI module",
   "app-building labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/microsoft/generative-ai-for-beginners",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "21 lessons",
     "MIT License",
     "Free",
     "Some lessons need Azure OpenAI, OpenAI API, Foundry or Foundry Local"
    ],
    "summary": "Repository README describing 21 lessons under MIT license with model-provider requirements."
   }
  ],
  "notes": "No certificate mentioned in repo. Some exercises require a model provider account (possibly paid); Foundry Local option runs offline.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "basic Python or TypeScript"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Generative AI applications"
   },
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "LLM applications"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ms-ml-for-beginners",
  "name": "ML for Beginners",
  "provider": "Microsoft",
  "official_url": "https://github.com/microsoft/ML-For-Beginners",
  "category": "course",
  "subjects": [
   "classical machine learning",
   "scikit-learn",
   "regression",
   "classification",
   "clustering",
   "NLP",
   "time series"
  ],
  "description": "Twelve-week open curriculum of classic machine learning with scikit-learn, including quizzes and projects.",
  "use_cases": [
   "intro ML module",
   "weekly mini-labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/microsoft/ML-For-Beginners",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "12 weeks, 26 lessons, 52 quizzes",
     "MIT License",
     "Free and open source",
     "Assumes basic Python"
    ],
    "summary": "Repository README stating curriculum length, MIT license and Python prerequisite."
   }
  ],
  "notes": "No certificate mentioned in repo. est_hours not stated.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "basic Python"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "Classical ML with scikit-learn"
   },
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Applied Python projects"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ms-ai-agents-for-beginners",
  "name": "AI Agents for Beginners",
  "provider": "Microsoft",
  "official_url": "https://github.com/microsoft/ai-agents-for-beginners",
  "category": "course",
  "subjects": [
   "agentic AI",
   "agent design patterns",
   "multi-agent",
   "agent security"
  ],
  "description": "Lesson series on designing and building AI agents with Microsoft Agent Framework, covering patterns, planning, multi-agent systems and deployment.",
  "use_cases": [
   "agentic AI module",
   "agent build labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/microsoft/ai-agents-for-beginners",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "18 lessons",
     "MIT license",
     "Azure account required for Foundry / Agent Service samples",
     "Prereqs: generative AI basics, Python, command line"
    ],
    "summary": "Repository README describing 18 agent lessons under MIT license and account needs."
   }
  ],
  "notes": "No certificate mentioned in repo. Some samples need an Azure account (may require billing setup).",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "Python",
   "generative AI basics",
   "command line"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Agent design patterns"
   },
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "Intelligent agents"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ms-ai-for-beginners",
  "name": "AI for Beginners",
  "provider": "Microsoft",
  "official_url": "https://github.com/microsoft/AI-For-Beginners",
  "category": "course",
  "subjects": [
   "symbolic AI",
   "neural networks",
   "computer vision",
   "NLP",
   "AI ethics"
  ],
  "description": "Twelve-week open curriculum surveying AI from symbolic methods to neural networks, vision and NLP with Jupyter notebooks.",
  "use_cases": [
   "AI survey module",
   "notebook labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/microsoft/AI-For-Beginners",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "12 weeks, 24 lessons",
     "MIT license",
     "PyTorch and TensorFlow notebooks"
    ],
    "summary": "Repository README describing the AI curriculum length, content and MIT license."
   }
  ],
  "notes": "No certificate mentioned in repo; prerequisites not explicitly stated.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "AI foundations survey"
   },
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Neural networks intro"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ms-learn-get-started-ai-azure",
  "name": "Get started with AI applications and agents on Azure (learning path)",
  "provider": "Microsoft Learn",
  "official_url": "https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence-on-azure/",
  "category": "course",
  "subjects": [
   "Azure AI",
   "generative AI",
   "agents",
   "computer vision",
   "speech",
   "text analysis"
  ],
  "description": "Seven-module beginner learning path on building AI workloads, generative AI and agents with Microsoft Foundry.",
  "use_cases": [
   "cloud AI services module",
   "AI-900 style fundamentals"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence-on-azure/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Beginner level, 7 modules",
     "Badge on completion",
     "Prereqs: basic computing concepts, Python"
    ],
    "summary": "Learning path page listing modules, level, prerequisites and completion badge."
   },
   {
    "url": "https://learn.microsoft.com/en-us/training/support/faq",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Microsoft Learn training is free",
     "Profile not required to access content; sign-in needed to track progress and accrue achievements"
    ],
    "summary": "Microsoft Learn FAQ confirming free training and optional sign-in."
   }
  ],
  "notes": "Completion yields a Microsoft Learn badge (sign-in required), not a certification; certification exams are separate and paid. Duration not stated. Hands-on labs may need an Azure subscription.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "basic computing concepts",
   "Python"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Cloud AI services and agents"
   }
  ],
  "kind": "course"
 },
 {
  "id": "mit-ocw-6-034-artificial-intelligence",
  "name": "6.034 Artificial Intelligence (Fall 2010)",
  "provider": "MIT OpenCourseWare",
  "official_url": "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/",
  "category": "course",
  "subjects": [
   "search",
   "constraint satisfaction",
   "knowledge representation",
   "machine learning",
   "AI"
  ],
  "description": "Archived undergraduate AI course by Patrick Winston with lecture videos, recitations, assignments and exams.",
  "use_cases": [
   "AI lecture supplement",
   "search/logic topics"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Instructor Patrick Henry Winston, undergraduate",
     "Lecture videos, mega-recitations, programming assignments, exams",
     "Creative Commons BY-NC-SA license",
     "OCW: freely shared materials"
    ],
    "summary": "OCW course page listing materials and CC BY-NC-SA licensing."
   }
  ],
  "notes": "License version not explicitly extracted for this page (OCW typically 4.0); noncommercial use only. No certificate mechanism mentioned.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Recommended",
    "topic": "Search, logic and classic AI"
   }
  ],
  "kind": "course"
 },
 {
  "id": "mit-ocw-6-0001-python",
  "name": "6.0001 Introduction to Computer Science and Programming in Python (Fall 2016)",
  "provider": "MIT OpenCourseWare",
  "official_url": "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
  "category": "course",
  "subjects": [
   "Python",
   "computational thinking",
   "programming fundamentals"
  ],
  "description": "Archived introductory programming course in Python for students with little or no prior experience.",
  "use_cases": [
   "intro Python lectures",
   "problem sets"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Instructors Ana Bell, Eric Grimson, John Guttag",
     "For students with little or no programming experience; Python 3.5",
     "Lecture videos, slides with code, problem sets",
     "CC BY-NC-SA 4.0",
     "Materials freely available, downloadable"
    ],
    "summary": "OCW course page confirming audience, materials and CC BY-NC-SA 4.0 license."
   }
  ],
  "notes": "Uses Python 3.5; noncommercial reuse only.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Recommended",
    "topic": "Python fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "mit-ocw-6-036-intro-ml",
  "name": "6.036 Introduction to Machine Learning (Fall 2020)",
  "provider": "MIT OpenCourseWare",
  "official_url": "https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/",
  "category": "course",
  "subjects": [
   "supervised learning",
   "reinforcement learning",
   "neural networks",
   "generalization"
  ],
  "description": "Archived undergraduate machine learning course covering modeling, prediction, supervised and reinforcement learning.",
  "use_cases": [
   "ML theory lectures",
   "exercise supplement"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Instructors Kaelbling, Lozano-Perez, Chuang, Boning",
     "Freely available via Open Learning Library; registration optional",
     "CC BY-NC-SA 4.0"
    ],
    "summary": "OCW page confirming free access and CC BY-NC-SA 4.0 license."
   }
  ],
  "notes": "Interactive version hosted on MIT Open Learning Library; enrollment optional for progress tracking.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "ML foundations"
   }
  ],
  "kind": "course"
 },
 {
  "id": "mit-6-s191-intro-deep-learning",
  "name": "MIT 6.S191 Introduction to Deep Learning",
  "provider": "MIT (Alexander Amini, Ava Amini)",
  "official_url": "http://introtodeeplearning.com/",
  "category": "course",
  "subjects": [
   "deep learning",
   "computer vision",
   "generative models",
   "NLP"
  ],
  "description": "Intensive bootcamp-style deep learning lecture series with open lectures and labs.",
  "use_cases": [
   "deep learning lectures",
   "lab notebooks"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "http://introtodeeplearning.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "All materials open-sourced for free under the MIT license",
     "Required attribution: (c) Alexander Amini and Ava Amini, MIT 6.S191",
     "Prereqs: calculus, linear algebra; Python helpful",
     "No credential for online learners"
    ],
    "summary": "Course site confirming free MIT-licensed materials, attribution text and prerequisites."
   }
  ],
  "notes": "MIT credit only for enrolled MIT students.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "calculus",
   "linear algebra",
   "Python helpful"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "Deep learning"
   },
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "Neural networks"
   }
  ],
  "kind": "course"
 },
 {
  "id": "cs50-ai-python",
  "name": "CS50's Introduction to Artificial Intelligence with Python",
  "provider": "Harvard University (CS50)",
  "official_url": "https://cs50.harvard.edu/ai/",
  "category": "course",
  "subjects": [
   "search",
   "knowledge",
   "uncertainty",
   "optimization",
   "machine learning",
   "neural networks",
   "NLP"
  ],
  "description": "Seven-week course on AI concepts and algorithms implemented in Python, as free OpenCourseWare.",
  "use_cases": [
   "AI projects",
   "lecture videos"
  ],
  "classification": "unknown",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "free",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://cs50.harvard.edu/ai/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free via OpenCourseWare",
     "Free CS50 certificate; paid edX verified/professional options",
     "Prereq: CS50x or one year of Python",
     "7 weeks of material",
     "Materials under a license permitting adoption/adaptation (cs50.harvard.edu/ai/license/)"
    ],
    "summary": "Course page confirming free access, free CS50 certificate and prerequisites."
   }
  ],
  "notes": "License page returned a redirect loop; exact license string unconfirmed. Free certificate and paid edX certificate both offered.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "CS50x or 1 year Python"
  ],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Recommended",
    "topic": "Search, logic, uncertainty, ML in Python"
   }
  ],
  "kind": "course"
 },
 {
  "id": "cs50p-python",
  "name": "CS50's Introduction to Programming with Python",
  "provider": "Harvard University (CS50)",
  "official_url": "https://cs50.harvard.edu/python/",
  "category": "course",
  "subjects": [
   "Python",
   "programming fundamentals",
   "testing",
   "libraries"
  ],
  "description": "Ten-week introductory Python programming course with a final project, offered as free OpenCourseWare.",
  "use_cases": [
   "Python fundamentals",
   "problem sets"
  ],
  "classification": "unknown",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "paid",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://cs50.harvard.edu/python/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free as OpenCourseWare",
     "Certificates listed: edX verified and edX professional",
     "No prior experience needed",
     "10 weeks plus final project",
     "Educators may adopt/adapt per license"
    ],
    "summary": "Course page confirming free access, edX certificates and length."
   }
  ],
  "notes": "License page returned a redirect loop; exact license string unconfirmed. Page listed only edX (paid) certificate options.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Recommended",
    "topic": "Python fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "cs50x-intro-cs",
  "name": "CS50x: Introduction to Computer Science",
  "provider": "Harvard University (CS50)",
  "official_url": "https://cs50.harvard.edu/x/",
  "category": "course",
  "subjects": [
   "computer science",
   "C",
   "Python",
   "SQL",
   "web"
  ],
  "description": "Eleven-week introduction to computer science and programming with a final project, offered as free OpenCourseWare.",
  "use_cases": [
   "programming foundations",
   "bridge course"
  ],
  "classification": "unknown",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "paid",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://cs50.harvard.edu/x/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free as OpenCourseWare",
     "Certificates listed: edX verified, professional certificates, Harvard credit options",
     "No prerequisites; two thirds never took CS",
     "11 weeks plus final project"
    ],
    "summary": "Course page confirming free access, certificate pathways and length."
   }
  ],
  "notes": "License page returned a redirect loop; exact license string unconfirmed. Fetched page listed edX certificate pathways only.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Programming foundations"
   }
  ],
  "kind": "course"
 },
 {
  "id": "stanford-see-cs229",
  "name": "CS229 Machine Learning (Stanford Engineering Everywhere)",
  "provider": "Stanford Engineering Everywhere",
  "official_url": "https://see.stanford.edu/Course/CS229",
  "category": "course",
  "subjects": [
   "supervised learning",
   "unsupervised learning",
   "learning theory",
   "reinforcement learning"
  ],
  "description": "Archived Andrew Ng machine learning lectures with lecture notes, review handouts and problem sets.",
  "use_cases": [
   "ML theory lectures",
   "problem sets"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://see.stanford.edu/Course/CS229",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "20 recorded lectures",
     "12 lecture-note PDFs, 6 review handouts, 4 problem sets with solutions",
     "Available at no cost via SEE",
     "Instructor Andrew Ng"
    ],
    "summary": "SEE CS229 page listing lectures and handouts; free access."
   },
   {
    "url": "https://see.stanford.edu/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "SEE offered online at no charge",
     "Creative Commons license allows use, reuse, adaptation and redistribution",
     "Linked license: CC BY-NC-SA 4.0"
    ],
    "summary": "SEE home page stating no-charge access and Creative Commons licensing."
   }
  ],
  "notes": "Course page itself did not show the license; license taken from SEE home page (version read from link reference). This is an older offering; current cs229.stanford.edu materials are Stanford-only. No certificate mechanism mentioned.",
  "level": "advanced",
  "est_hours": null,
  "prerequisites": [
   "programming",
   "probability",
   "linear algebra"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "ML theory and algorithms"
   }
  ],
  "kind": "course"
 },
 {
  "id": "stanford-cs231n-notes",
  "name": "CS231n Course Notes (Deep Learning for Computer Vision)",
  "provider": "Stanford University",
  "official_url": "https://cs231n.github.io/",
  "category": "reading",
  "subjects": [
   "computer vision",
   "CNNs",
   "deep learning",
   "NumPy"
  ],
  "description": "Public lecture notes and tutorials from Stanford's convolutional neural networks for visual recognition course.",
  "use_cases": [
   "CNN readings",
   "NumPy refresher"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://cs231n.stanford.edu/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Public notes at cs231n.github.io incl. Python-numpy tutorial",
     "Current videos restricted to enrolled students; past recordings on YouTube",
     "Prereqs: Python/NumPy, calculus, linear algebra, probability"
    ],
    "summary": "Course homepage describing public notes and video availability."
   },
   {
    "url": "https://github.com/cs231n/cs231n.github.io",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository licensed MIT"
    ],
    "summary": "Public notes repository under MIT License."
   }
  ],
  "notes": "Official URL is the public notes site referenced from the course page.",
  "level": "advanced",
  "est_hours": null,
  "prerequisites": [
   "Python/NumPy",
   "calculus",
   "linear algebra",
   "probability"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "CNNs and computer vision"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "stanford-cs234-rl",
  "name": "CS234 Reinforcement Learning",
  "provider": "Stanford University",
  "official_url": "https://web.stanford.edu/class/cs234/",
  "category": "course",
  "subjects": [
   "reinforcement learning"
  ],
  "description": "Stanford graduate-level reinforcement learning course site with lecture materials page and readings.",
  "use_cases": [
   "RL readings",
   "slides"
  ],
  "classification": "unknown",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://web.stanford.edu/class/cs234/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Winter 2026 offering",
     "Lecture materials page at modules.html",
     "Prereqs: Python, calculus, linear algebra, probability, CS221/CS229",
     "Sutton & Barto as main reading"
    ],
    "summary": "Course site describing RL topics, prerequisites and a lecture-materials page."
   }
  ],
  "notes": "Public availability of videos/slides and any license not confirmed.",
  "level": "advanced",
  "est_hours": null,
  "prerequisites": [
   "Python",
   "linear algebra",
   "probability",
   "ML foundations"
  ],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "Reinforcement learning"
   }
  ],
  "kind": "course"
 },
 {
  "id": "berkeley-cs188-pacman",
  "name": "CS188 Introduction to Artificial Intelligence / Pac-Man Projects",
  "provider": "UC Berkeley",
  "official_url": "http://ai.berkeley.edu/project_overview.html",
  "category": "course",
  "subjects": [
   "search",
   "probabilistic inference",
   "reinforcement learning"
  ],
  "description": "Berkeley intro AI course materials including Pac-Man programming projects on search, inference and RL.",
  "use_cases": [
   "AI programming projects"
  ],
  "classification": "unknown",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "http://ai.berkeley.edu/project_overview.html",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Projects teach search, probabilistic inference, RL",
     "Developed by DeNero, Klein, Abbeel and others",
     "Released for educational use"
    ],
    "summary": "Project overview page; no explicit license terms extracted."
   },
   {
    "url": "https://inst.eecs.berkeley.edu/~cs188/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Index/redirect page for Intro to AI"
    ],
    "summary": "Course index page with no licensing or prerequisite details."
   }
  ],
  "notes": "Reuse terms (attribution / no published solutions) not found on fetched pages.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Recommended",
    "topic": "Search and inference projects"
   }
  ],
  "kind": "course"
 },
 {
  "id": "d2l-dive-into-deep-learning",
  "name": "Dive into Deep Learning",
  "provider": "D2L (d2l.ai)",
  "official_url": "https://d2l.ai/",
  "category": "reading",
  "subjects": [
   "deep learning",
   "PyTorch",
   "JAX",
   "TensorFlow"
  ],
  "description": "Interactive open textbook on deep learning with runnable notebooks in several frameworks.",
  "use_cases": [
   "DL textbook readings",
   "notebook labs"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-SA 4.0 (text); modified MIT (sample code)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://d2l.ai/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Interactive online book with Jupyter notebooks",
     "PyTorch, NumPy/MXNet, JAX, TensorFlow",
     "Adopted at 500 universities"
    ],
    "summary": "Book home page describing interactive multi-framework content."
   },
   {
    "url": "https://github.com/d2l-ai/d2l-en",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Text under CC BY-SA 4.0",
     "Sample code under modified MIT license"
    ],
    "summary": "Repository stating text and code licenses."
   }
  ],
  "notes": "",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "Deep learning textbook"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "python-official-tutorial",
  "name": "The Python Tutorial",
  "provider": "Python Software Foundation",
  "official_url": "https://docs.python.org/3/tutorial/index.html",
  "category": "reading",
  "subjects": [
   "Python"
  ],
  "description": "Official tutorial introducing Python's syntax, data structures, modules and classes for programmers new to the language.",
  "use_cases": [
   "Python reference",
   "reading assignments"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "PSF License Version 2 (text); Zero Clause BSD (code examples)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://docs.python.org/3/tutorial/index.html",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Designed for programmers new to Python, not programming beginners",
     "Python 3.14 docs",
     "Page licensed under PSF License Version 2; code under Zero Clause BSD"
    ],
    "summary": "Official tutorial index with audience note and license footer."
   }
  ],
  "notes": "Not aimed at total beginners.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "general programming experience"
  ],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Python language reference"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "think-python-3e",
  "name": "Think Python, 3rd Edition",
  "provider": "Green Tea Press (Allen B. Downey)",
  "official_url": "https://allendowney.github.io/ThinkPython/",
  "category": "reading",
  "subjects": [
   "Python",
   "programming fundamentals"
  ],
  "description": "Beginner Python textbook delivered as runnable Jupyter notebooks, free online.",
  "use_cases": [
   "intro Python readings",
   "Colab exercises"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC-SA 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://allendowney.github.io/ThinkPython/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Entirely in Jupyter notebooks, runnable on Colab",
     "19 chapters free online",
     "Licensed CC BY-NC-SA 4.0"
    ],
    "summary": "Book site confirming free notebook chapters and CC BY-NC-SA 4.0."
   }
  ],
  "notes": "Noncommercial reuse only.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Python fundamentals"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "automate-the-boring-stuff-3e",
  "name": "Automate the Boring Stuff with Python, 3rd Edition",
  "provider": "Al Sweigart / No Starch Press",
  "official_url": "https://automatetheboringstuff.com/",
  "category": "reading",
  "subjects": [
   "Python",
   "automation",
   "scripting"
  ],
  "description": "Beginner Python book focused on practical automation tasks, readable free online.",
  "use_cases": [
   "applied Python projects"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://automatetheboringstuff.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free to read under a Creative Commons license",
     "3rd edition, fully revised",
     "No prior programming experience required"
    ],
    "summary": "Book home page stating free reading under a Creative Commons license."
   },
   {
    "url": "https://automatetheboringstuff.com/3e/chapter0.html",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "No explicit license text in introduction"
    ],
    "summary": "Intro chapter without a license statement."
   }
  ],
  "notes": "Creative Commons variant/version not stated on fetched pages.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Practical Python scripting"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "elements-of-ai-intro",
  "name": "Elements of AI: Introduction to AI",
  "provider": "University of Helsinki and MinnaLearn",
  "official_url": "https://www.elementsofai.com/",
  "category": "course",
  "subjects": [
   "AI literacy",
   "AI concepts",
   "AI ethics"
  ],
  "description": "Non-technical online introduction to what AI is and how it affects society.",
  "use_cases": [
   "AI literacy orientation"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.elementsofai.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free online courses",
     "Introduction to AI needs no complicated math or programming",
     "Sign-up required"
    ],
    "summary": "Home page describing free courses and prerequisites."
   },
   {
    "url": "https://www.elementsofai.com/faq/i-have-passed-an-elements-of-ai-course-where-is-my-certificate-2",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Introduction to AI certificate is free of charge after peer reviews"
    ],
    "summary": "FAQ confirming free Introduction to AI certificate."
   }
  ],
  "notes": "Content license not confirmed. Duration not stated on fetched pages.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "AI concepts and ethics"
   }
  ],
  "kind": "course"
 },
 {
  "id": "elements-of-ai-building-ai",
  "name": "Elements of AI: Building AI",
  "provider": "University of Helsinki and MinnaLearn",
  "official_url": "https://www.elementsofai.com/",
  "category": "course",
  "subjects": [
   "AI algorithms",
   "Python",
   "machine learning"
  ],
  "description": "Follow-on online course covering practical AI methods with some Python exercises.",
  "use_cases": [
   "bridge to applied ML"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [
   {
    "metric": "certificate_fee",
    "value": "50",
    "unit": "EUR",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "paid",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.elementsofai.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free online courses incl. Building AI",
     "Basic Python recommended"
    ],
    "summary": "Home page listing Building AI as a free course."
   },
   {
    "url": "https://www.elementsofai.com/faq/i-have-passed-an-elements-of-ai-course-where-is-my-certificate-2",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Building AI shareable certificate costs 50 EUR incl. VAT"
    ],
    "summary": "FAQ confirming paid Building AI certificate."
   }
  ],
  "notes": "Exact Building AI course URL not fetched; official_url is the program home page. Content license not confirmed.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [
   "basic Python"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Intro ML methods"
   }
  ],
  "kind": "course"
 },
 {
  "id": "langchain-academy-intro-langgraph",
  "name": "Introduction to LangGraph - Python",
  "provider": "LangChain Academy",
  "official_url": "https://academy.langchain.com/courses/intro-to-langgraph",
  "category": "course",
  "subjects": [
   "LangGraph",
   "agentic AI",
   "multi-agent systems"
  ],
  "description": "Video course on building agentic and multi-agent applications with the LangGraph framework.",
  "use_cases": [
   "agent orchestration module"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://academy.langchain.com/courses/intro-to-langgraph",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Enroll for free",
     "55 lessons, 6 hours of video",
     "Sign-in/registration required"
    ],
    "summary": "Course page confirming free enrollment and length."
   },
   {
    "url": "https://academy.langchain.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Separate certification program (LangChain Certified Agent Engineer) promoted"
    ],
    "summary": "Academy home page; course pricing details not listed."
   }
  ],
  "notes": "Certificate for this course not stated; academy promotes a separate certification whose cost was not confirmed.",
  "level": "intermediate",
  "est_hours": 6,
  "prerequisites": [
   "Python"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Agent orchestration with LangGraph"
   }
  ],
  "kind": "course"
 },
 {
  "id": "anthropic-courses",
  "name": "Anthropic Educational Courses",
  "provider": "Anthropic",
  "official_url": "https://github.com/anthropics/courses",
  "category": "course",
  "subjects": [
   "prompt engineering",
   "Claude API",
   "tool use",
   "evaluations"
  ],
  "description": "Notebook-based courses on the Claude API, prompt engineering, real-world prompting, prompt evaluations and tool use.",
  "use_cases": [
   "prompt engineering labs",
   "tool-use labs"
  ],
  "classification": "open_resource",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY-NC 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/anthropics/courses",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Five courses: API fundamentals, prompt engineering tutorial, real-world prompting, prompt evaluations, tool use",
     "API key required"
    ],
    "summary": "Repository README listing the courses and API key requirement."
   },
   {
    "url": "https://github.com/anthropics/courses/blob/master/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "CC BY-NC 4.0"
    ],
    "summary": "LICENSE file is Creative Commons Attribution-NonCommercial 4.0."
   }
  ],
  "notes": "Running notebooks requires an Anthropic API key (usage billed); reading is free. Noncommercial reuse only. No certificate mentioned.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "Python",
   "Anthropic API key"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Recommended",
    "topic": "Prompting and tool use"
   },
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "LLM prompting"
   }
  ],
  "kind": "course"
 },
 {
  "id": "openai-cookbook",
  "name": "OpenAI Cookbook",
  "provider": "OpenAI",
  "official_url": "https://github.com/openai/openai-cookbook",
  "category": "reading",
  "subjects": [
   "OpenAI API",
   "LLM applications",
   "embeddings",
   "agents"
  ],
  "description": "Collection of example code and guides for common tasks with the OpenAI API, mostly in Python.",
  "use_cases": [
   "API code examples",
   "RAG/agent demos"
  ],
  "classification": "open_resource",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/openai/openai-cookbook",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Example code and guides for the OpenAI API",
     "MIT License",
     "Running examples needs OPENAI_API_KEY"
    ],
    "summary": "Repository README with MIT license and API key requirement."
   }
  ],
  "notes": "Reading is free; running examples needs an OpenAI API key (usage billed).",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [
   "Python",
   "OpenAI API key"
  ],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Supplementary",
    "topic": "LLM API patterns"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "inria-scikit-learn-mooc",
  "name": "Machine Learning in Python with scikit-learn (MOOC)",
  "provider": "Inria",
  "official_url": "https://inria.github.io/scikit-learn-mooc/",
  "category": "course",
  "subjects": [
   "scikit-learn",
   "predictive modeling",
   "model evaluation",
   "ensembles"
  ],
  "description": "Open MOOC on predictive modeling with scikit-learn, with notebooks, quizzes and exercises.",
  "use_cases": [
   "scikit-learn labs",
   "model evaluation module"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "free",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://inria.github.io/scikit-learn-mooc/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free; developed publicly under CC-BY",
     "Prereqs: Python; NumPy, pandas, Matplotlib",
     "Hosted on FUN MOOC for self-paced learning"
    ],
    "summary": "Course site confirming free access and CC-BY license."
   },
   {
    "url": "https://www.fun-mooc.fr/en/courses/machine-learning-python-scikit-learn/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "MOOC free of charge",
     "About 36 hours",
     "Open Badge issued on request at 60% overall score",
     "Content CC BY 4.0"
    ],
    "summary": "FUN MOOC page confirming duration, free Open Badge and license."
   }
  ],
  "notes": "Account needed only on FUN MOOC for quizzes/badge; materials readable without account. Separate probabl.ai certification also promoted (terms not confirmed).",
  "level": "intermediate",
  "est_hours": 36,
  "prerequisites": [
   "Python",
   "NumPy/pandas/Matplotlib recommended"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "scikit-learn workflows"
   }
  ],
  "kind": "course"
 },
 {
  "id": "pytorch-tutorials",
  "name": "PyTorch Tutorials",
  "provider": "PyTorch (Linux Foundation)",
  "official_url": "https://docs.pytorch.org/tutorials/",
  "category": "reading",
  "subjects": [
   "PyTorch",
   "deep learning",
   "tensors"
  ],
  "description": "Official tutorials from PyTorch basics to advanced training and deployment techniques.",
  "use_cases": [
   "DL lab tutorials"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "BSD-3-Clause",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://docs.pytorch.org/tutorials/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Beginner: Learn the Basics, Intro to PyTorch on YouTube, Learning PyTorch with Examples, What is torch.nn really?",
     "Footer: Copyright The Linux Foundation, all rights reserved"
    ],
    "summary": "Tutorials index listing beginner sections and copyright footer."
   },
   {
    "url": "https://github.com/pytorch/tutorials",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "PyTorch Tutorials is BSD licensed"
    ],
    "summary": "Tutorials repository stating BSD-3-Clause license."
   }
  ],
  "notes": "Site footer says all rights reserved while source repo is BSD-3-Clause; trademarks excluded.",
  "level": "mixed",
  "est_hours": null,
  "prerequisites": [
   "Python"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "PyTorch implementation"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "coursera-ml-specialization",
  "name": "Machine Learning Specialization (Andrew Ng)",
  "provider": "DeepLearning.AI and Stanford Online on Coursera",
  "official_url": "https://www.coursera.org/specializations/machine-learning-introduction",
  "category": "course",
  "subjects": [
   "supervised learning",
   "neural networks",
   "decision trees",
   "unsupervised learning",
   "recommenders",
   "reinforcement learning"
  ],
  "description": "Three-course beginner machine learning specialization taught by Andrew Ng.",
  "use_cases": [
   "structured ML pathway"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [
   {
    "metric": "audit_access",
    "value": "free",
    "unit": "n/a",
    "reset_period": null
   },
   {
    "metric": "subscription",
    "value": "49",
    "unit": "USD/month",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "prohibited",
  "attribution_required": null,
  "certificate": "paid",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.coursera.org/specializations/machine-learning-introduction",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Audit option available, no certificate",
     "Certificates require payment; $49/month subscription",
     "Financial aid available",
     "About 95 hours (33/34/28) over ~2 months at 10 h/week",
     "Beginner; basic coding and high-school math"
    ],
    "summary": "Coursera page confirming audit option, paid certificate and duration."
   }
  ],
  "notes": "Audit access may exclude graded items. Redistribution prohibited as proprietary platform content (no open license stated).",
  "level": "beginner",
  "est_hours": 95,
  "prerequisites": [
   "basic coding",
   "high-school math"
  ],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Recommended",
    "topic": "ML foundations"
   }
  ],
  "kind": "course"
 },
 {
  "id": "google-skills-intro-generative-ai",
  "name": "Beginner: Introduction to Generative AI (learning path)",
  "provider": "Google Cloud Skills (skills.google)",
  "official_url": "https://www.skills.google/paths/118",
  "category": "course",
  "subjects": [
   "generative AI",
   "LLMs",
   "responsible AI"
  ],
  "description": "Four-activity beginner path on generative AI concepts, large language models and responsible AI.",
  "use_cases": [
   "GenAI orientation"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.skills.google/paths/118",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free, no subscription required",
     "4 activities",
     "Sign in or join required"
    ],
    "summary": "Path page (redirected from cloudskillsboost.google) confirming free access and sign-in."
   }
  ],
  "notes": "Original URL cloudskillsboost.google/paths/118 redirects here. Badge/certificate terms and duration not stated.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Supplementary",
    "topic": "Generative AI concepts"
   }
  ],
  "kind": "course"
 },
 {
  "id": "cisco-netacad-intro-cybersecurity",
  "name": "Introduction to Cybersecurity",
  "provider": "Cisco Networking Academy",
  "official_url": "https://www.netacad.com/courses/introduction-to-cybersecurity",
  "category": "course",
  "subjects": [
   "cybersecurity",
   "threats",
   "network security basics"
  ],
  "description": "Introductory online course on cybersecurity threats and protections.",
  "use_cases": [
   "security orientation"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.netacad.com/courses/introduction-to-cybersecurity",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Page title: Introduction to Cybersecurity by Cisco: Free Online Course",
     "Page requires JavaScript; details not rendered"
    ],
    "summary": "JS-rendered course page; only title metadata indicating free online course was readable."
   }
  ],
  "notes": "Duration, badge and account terms not readable (JS-only page).",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CTS2314 Network Security",
    "relation": "Recommended",
    "topic": "Cybersecurity fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "cisco-netacad-networking-basics",
  "name": "Networking Basics",
  "provider": "Cisco Networking Academy",
  "official_url": "https://www.netacad.com/courses/networking-basics",
  "category": "course",
  "subjects": [
   "networking",
   "TCP/IP",
   "network fundamentals"
  ],
  "description": "Introductory online course on how networks and their protocols work.",
  "use_cases": [
   "networking prerequisites"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.netacad.com/courses/networking-basics",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Metadata: Free online course to learn about Networking Basics",
     "Page requires JavaScript"
    ],
    "summary": "JS-rendered course page; only metadata indicating free course was readable."
   }
  ],
  "notes": "Duration, badge and account terms not readable (JS-only page).",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CTS2314 Network Security",
    "relation": "Recommended",
    "topic": "Networking fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "ibm-skillsbuild-ai",
  "name": "IBM SkillsBuild AI learning catalog",
  "provider": "IBM SkillsBuild",
  "official_url": "https://skillsbuild.org/students/course-catalog/artificial-intelligence",
  "category": "course",
  "subjects": [
   "AI fundamentals",
   "generative AI"
  ],
  "description": "IBM's free learning platform catalog of AI courses and credentials for students and educators.",
  "use_cases": [
   "AI fundamentals with digital credentials"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://skillsbuild.org/students/course-catalog/artificial-intelligence",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free to use and adaptable to different classroom experiences",
     "Specific course/credential details not shown"
    ],
    "summary": "Catalog page stating SkillsBuild is free; no course-level details extracted."
   }
  ],
  "notes": "Specific courses (e.g., AI Fundamentals), durations and badge terms not confirmed on an official IBM page.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Advanced Artificial Intelligence",
    "relation": "Supplementary",
    "topic": "AI fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "aws-skill-builder-free-digital",
  "name": "AWS Skill Builder free digital training",
  "provider": "Amazon Web Services",
  "official_url": "https://aws.amazon.com/training/digital/",
  "category": "course",
  "subjects": [
   "cloud",
   "AI/ML on AWS",
   "generative AI"
  ],
  "description": "AWS catalog of free self-paced digital courses across AWS services, including AI topics.",
  "use_cases": [
   "cloud AI services"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://aws.amazon.com/training/digital/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Over 900 free self-paced digital courses",
     "Learn about AI featured",
     "Account needed via Skill Builder"
    ],
    "summary": "AWS digital training page confirming free courses but naming no specific AI course."
   }
  ],
  "notes": "No specific AI/ML course page fetched; certificate/badge terms not confirmed.",
  "level": "mixed",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "AI-801 Advanced Agentic Cloud Systems",
    "relation": "Supplementary",
    "topic": "Cloud AI services"
   }
  ],
  "kind": "course"
 },
 {
  "id": "nvidia-dli-free-courses",
  "name": "NVIDIA Deep Learning Institute free self-paced courses",
  "provider": "NVIDIA Deep Learning Institute",
  "official_url": "https://www.nvidia.com/en-us/training/self-paced-courses/",
  "category": "course",
  "subjects": [
   "deep learning",
   "accelerated computing",
   "generative AI"
  ],
  "description": "Collection of NVIDIA self-paced courses, many offered free and completable in a day or less.",
  "use_cases": [
   "GPU/DL short courses"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.nvidia.com/en-us/training/self-paced-courses/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Many popular self-paced courses offered free",
     "Completable in a day or less, beginner-oriented",
     "Select courses offer a certificate of competency"
    ],
    "summary": "Self-paced training page; specific free courses and certificate terms not listed."
   }
  ],
  "notes": "Individual course page fetch returned unpopulated fields; which free courses carry certificates is unconfirmed.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Deep learning short courses"
   }
  ],
  "kind": "course"
 },
 {
  "id": "khan-academy-computing",
  "name": "Khan Academy Computing (Computer Programming)",
  "provider": "Khan Academy",
  "official_url": "https://www.khanacademy.org/computing/computer-programming",
  "category": "course",
  "subjects": [
   "programming",
   "computer science"
  ],
  "description": "Nonprofit platform's self-paced computing and programming lessons.",
  "use_cases": [
   "programming warm-up"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "unknown",
  "integration_method": "link",
  "status": "pending",
  "evidence": [
   {
    "url": "https://www.khanacademy.org/about",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Mission: free, world-class education for anyone, anywhere",
     "501(c)(3) nonprofit"
    ],
    "summary": "About page stating Khan Academy is free and nonprofit."
   },
   {
    "url": "https://www.khanacademy.org/computing/computer-programming",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Only metadata rendered"
    ],
    "summary": "Course page did not render content."
   }
  ],
  "notes": "Course page content (languages, units, license) not readable; certificate terms unknown.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Supplementary",
    "topic": "Programming basics"
   }
  ],
  "kind": "course"
 },
 {
  "id": "py4e-python-for-everybody",
  "name": "Python for Everybody",
  "provider": "Dr. Charles R. Severance (py4e.com)",
  "official_url": "https://www.py4e.com/",
  "category": "course",
  "subjects": [
   "Python",
   "data",
   "databases",
   "web data"
  ],
  "description": "Free open course with lectures, book and assignments teaching Python programming to beginners.",
  "use_cases": [
   "intro Python lectures",
   "autograded assignments"
  ],
  "classification": "open_resource",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": "CC BY 4.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": true,
  "certificate": "paid",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.py4e.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free materials, lectures, book, assignments",
     "Licensed CC BY 4.0",
     "Effort badges on site; certificates via Coursera/edX partners"
    ],
    "summary": "Course site confirming free open course, CC BY 4.0 and certificate routes."
   }
  ],
  "notes": "Site awards free effort badges; formal certificates come via paid Coursera/edX tracks.",
  "level": "beginner",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "Python Programming (Gaddis 6th ed.)",
    "relation": "Recommended",
    "topic": "Python fundamentals"
   }
  ],
  "kind": "course"
 },
 {
  "id": "mml-book",
  "name": "Mathematics for Machine Learning",
  "provider": "Deisenroth, Faisal, Ong (Cambridge University Press)",
  "official_url": "https://mml-book.github.io/",
  "category": "reading",
  "subjects": [
   "linear algebra",
   "calculus",
   "probability",
   "optimization"
  ],
  "description": "Textbook covering the mathematical foundations used in machine learning, with a freely available PDF.",
  "use_cases": [
   "math prerequisite readings"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://mml-book.github.io/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "PDFs kept freely available",
     "Authors Deisenroth, Faisal, Ong; Cambridge University Press 2020"
    ],
    "summary": "Book site confirming free PDF and publication details."
   }
  ],
  "notes": "No license stated; treat as free-to-read only.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Mathematical foundations"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "nielsen-neural-networks-deep-learning",
  "name": "Neural Networks and Deep Learning",
  "provider": "neuralnetworksanddeeplearning.com",
  "official_url": "http://neuralnetworksanddeeplearning.com/",
  "category": "reading",
  "subjects": [
   "neural networks",
   "backpropagation",
   "deep learning"
  ],
  "description": "Free online book explaining neural network fundamentals through handwritten digit recognition.",
  "use_cases": [
   "backprop readings"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "http://neuralnetworksanddeeplearning.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Described as a free online book",
     "Topics from digit recognition to training deep networks"
    ],
    "summary": "Book home page confirming free online access."
   }
  ],
  "notes": "License and author not extracted from fetched page; book is commonly attributed to Michael Nielsen (not confirmed here).",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CAI 4510C Machine Learning",
    "relation": "Supplementary",
    "topic": "Neural network fundamentals"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "owasp-top-ten",
  "name": "OWASP Top 10",
  "provider": "OWASP Foundation",
  "official_url": "https://owasp.org/www-project-top-ten/",
  "category": "reading",
  "subjects": [
   "web application security",
   "vulnerabilities",
   "secure coding"
  ],
  "description": "Awareness document ranking the most critical web application security risks.",
  "use_cases": [
   "security risk readings",
   "case-study discussion"
  ],
  "classification": "ongoing_free",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "unavailable",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": "none",
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://owasp.org/www-project-top-ten/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Reference standard for critical web app security risks",
     "Latest version 2025",
     "All resources free and open to everyone"
    ],
    "summary": "Project page confirming free access and latest edition."
   },
   {
    "url": "https://github.com/OWASP/Top10",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "LICENSE file present; terms not displayed"
    ],
    "summary": "Repository has a LICENSE file whose terms were not extracted."
   }
  ],
  "notes": "Open license likely but not confirmed; classified ongoing_free until LICENSE is read.",
  "level": "intermediate",
  "est_hours": null,
  "prerequisites": [],
  "maps_to": [
   {
    "course": "CTS2314 Network Security",
    "relation": "Recommended",
    "topic": "Web application security risks"
   }
  ],
  "kind": "reading"
 },
 {
  "id": "chatgpt",
  "kind": "tool",
  "name": "ChatGPT",
  "provider": "OpenAI",
  "official_url": "https://chatgpt.com/",
  "category": "ai_tool",
  "subjects": [
   "generative-ai",
   "prompt-engineering"
  ],
  "description": "A conversational AI assistant from OpenAI offered on web, desktop and mobile with a no-cost tier.",
  "use_cases": [
   "drafting and explaining code",
   "brainstorming",
   "summarizing readings"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "paid",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://chatgpt.com/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan costs nothing",
     "Unlimited text chats on the default model, subject to abuse guardrails",
     "Uploads, image creation, voice, deep research and Codex access are limited on Free"
    ],
    "summary": "Pricing page lists a no-cost Free tier with unlimited basic text chat and capped advanced features."
   },
   {
    "url": "https://openai.com/api/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "OpenAI APIs are billed separately from ChatGPT subscriptions",
     "No API free tier described on the page"
    ],
    "summary": "API pricing page states API usage is billed separately from ChatGPT plans."
   }
  ],
  "notes": "Free chat access does not include API usage; API calls are billed per usage. Exact Free-tier caps for uploads, images, voice and research are not stated as numbers. Account requirement not confirmed on fetched pages.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "claude",
  "kind": "tool",
  "name": "Claude",
  "provider": "Anthropic",
  "official_url": "https://claude.ai/",
  "category": "ai_tool",
  "subjects": [
   "generative-ai",
   "prompt-engineering"
  ],
  "description": "Anthropic's AI assistant available on web, desktop and mobile, including a free plan.",
  "use_cases": [
   "writing and analysis",
   "code explanation",
   "building Artifacts"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "paid",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://claude.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan includes chat on web, desktop and mobile",
     "Free plan includes web search, file creation, code execution, memory and Artifacts",
     "Claude Code is not included on Free",
     "API usage priced at per-token model rates"
    ],
    "summary": "Pricing page describes a free Claude plan and separate token-based API pricing."
   }
  ],
  "notes": "Free plan usage caps are not given as numbers. API access is billed per token via the Claude Console, separate from the free chat plan. Account requirement not explicitly confirmed on the fetched page.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "gemini",
  "kind": "tool",
  "name": "Gemini",
  "provider": "Google",
  "official_url": "https://gemini.google/",
  "category": "ai_tool",
  "subjects": [
   "generative-ai",
   "multimodal-ai"
  ],
  "description": "Google's AI assistant app with a free tier covering chat, image tools and research features.",
  "use_cases": [
   "research assistance",
   "image generation",
   "multimodal Q&A"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://gemini.google/subscriptions/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free tier includes a Flash model with varying access to a Pro model",
     "Includes image generation, Deep Research, Gemini Live, Canvas and Gems",
     "Rate limits may apply; paid tiers offer higher usage limits"
    ],
    "summary": "Subscriptions page shows a free Gemini tier with core features and lower usage limits than paid tiers."
   },
   {
    "url": "https://ai.google.dev/gemini-api/docs/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Gemini API has a free tier with limited model access",
     "Free-tier content may be used to improve Google products",
     "Some models and features require the paid tier"
    ],
    "summary": "API pricing page confirms a limited free API tier alongside paid usage."
   }
  ],
  "notes": "Free app rate limits are unspecified. The Gemini API free tier is limited and free-tier data may be used for product improvement; advanced models and features require paid API billing.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "mistral-le-chat",
  "kind": "tool",
  "name": "Mistral Le Chat (now Vibe)",
  "provider": "Mistral AI",
  "official_url": "https://chat.mistral.ai/",
  "category": "ai_tool",
  "subjects": [
   "generative-ai",
   "prompt-engineering"
  ],
  "description": "Mistral AI's chat assistant, recently renamed Vibe, offering a free plan on web and mobile.",
  "use_cases": [
   "everyday Q&A",
   "web search",
   "trying Mistral models in Studio"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [
   {
    "metric": "api_credits",
    "value": 10,
    "unit": "USD",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://mistral.ai/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan with limited messages, web searches and coding sessions",
     "Free plan includes $10 per month in API credits",
     "Subject to fair usage limits"
    ],
    "summary": "Pricing page lists a Free plan with capped usage and a monthly API credit allowance."
   },
   {
    "url": "https://mistral.ai/products/le-chat",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Le Chat has been rebranded as Vibe",
     "Free tier available; web at chat.mistral.ai plus iOS and Android apps"
    ],
    "summary": "Product page announces the Le Chat to Vibe rename and confirms a free tier."
   }
  ],
  "notes": "Product is now branded Vibe; the program page should reflect the new name. API use beyond the monthly credit is billed. Message limits are not quantified.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "mistral-open-weight-models",
  "kind": "tool",
  "name": "Mistral open-weight models",
  "provider": "Mistral AI",
  "official_url": "https://docs.mistral.ai/getting-started/models/",
  "category": "ai_tool",
  "subjects": [
   "open-weight-llms",
   "fine-tuning",
   "local-inference"
  ],
  "description": "A family of Mistral language and multimodal models whose weights are published under the Apache 2.0 license.",
  "use_cases": [
   "local inference",
   "fine-tuning experiments",
   "model comparison"
  ],
  "classification": "open_source",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [],
  "license": "Apache-2.0 (per model; e.g., Mistral Small 4, Mistral Large 3, Ministral 3)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://docs.mistral.ai/getting-started/models/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Mistral Small 4 is Apache 2.0",
     "Mistral Large 3 is an open-weight model under Apache 2.0",
     "Ministral 3 (14B, 8B, 3B) are Apache 2.0"
    ],
    "summary": "Models docs list several open-weight Mistral models released under Apache 2.0."
   }
  ],
  "notes": "License applies per model; not every Mistral model is open-weight, so check each model's license. Weights are free but running them needs your own GPU/compute; hosted API use is billed (Free plan includes small monthly credits).",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "visual-studio-code",
  "kind": "tool",
  "name": "Visual Studio Code",
  "provider": "Microsoft",
  "official_url": "https://code.visualstudio.com/",
  "category": "ai_tool",
  "subjects": [
   "software-development",
   "python"
  ],
  "description": "A free cross-platform code editor from Microsoft with extensions and built-in AI features.",
  "use_cases": [
   "editing Python and notebooks",
   "running extensions such as Claude Code",
   "debugging"
  ],
  "classification": "ongoing_free",
  "account_required": null,
  "payment_card_required": false,
  "api_access": "unknown",
  "limits": [],
  "license": "Microsoft Software License Terms (VS Code product); MIT (Code - OSS source)",
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://code.visualstudio.com/license",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Product distributed under Microsoft software license terms",
     "Source code available on GitHub under the MIT license",
     "Product may not be offered as a stand-alone service to others"
    ],
    "summary": "License page separates the proprietary-licensed product build from MIT-licensed source code."
   },
   {
    "url": "https://code.visualstudio.com/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Described as a free, open source AI code editor",
     "AI agent features usable free with a GitHub account and no credit card"
    ],
    "summary": "Homepage presents VS Code as free and offers no-card AI features via GitHub sign-in."
   }
  ],
  "notes": "Editor is free; the downloadable build is under Microsoft's license while source is MIT. Built-in AI features beyond the free allotment and third-party extensions (e.g., Claude Code, Copilot paid tiers) may cost money. payment_card_required=false applies to the free AI offer per homepage.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "claude-code",
  "kind": "tool",
  "name": "Claude Code",
  "provider": "Anthropic",
  "official_url": "https://code.claude.com/",
  "category": "agentic_ai",
  "subjects": [
   "agentic-ai",
   "software-development"
  ],
  "description": "An agentic coding tool that works in a terminal, IDE, desktop app or browser to read, edit and run code in a project.",
  "use_cases": [
   "automated refactoring and tests",
   "git commits and pull requests",
   "building custom agents with the Agent SDK"
  ],
  "classification": "unknown",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "paid",
  "limits": [],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "api",
  "status": "pending",
  "evidence": [
   {
    "url": "https://claude.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Claude Code not included in the Free plan",
     "Included starting with Pro and in Max, Team and Enterprise",
     "Shares usage limits with the rest of the plan"
    ],
    "summary": "Pricing page shows Claude Code is a paid-plan feature, not part of Free."
   },
   {
    "url": "https://code.claude.com/docs/en/overview",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Most surfaces require a Claude subscription or Anthropic Console account",
     "Can authenticate with an ANTHROPIC_API_KEY",
     "Desktop app requires a paid subscription",
     "Terminal, VS Code and JetBrains support third-party providers"
    ],
    "summary": "Docs say Claude Code needs a paid Claude plan or Console/API billing."
   }
  ],
  "notes": "No free access: requires a paid Claude plan (Pro or higher) or pay-as-you-go API billing via the Anthropic Console. Classification schema has no 'paid' value, so set to unknown; student/education discounts not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "meta-llama",
  "kind": "tool",
  "name": "Meta Llama",
  "provider": "Meta",
  "official_url": "https://www.llama.com/",
  "category": "ai_tool",
  "subjects": [
   "open-weight-llms",
   "fine-tuning",
   "local-inference"
  ],
  "description": "Meta's family of downloadable large language models distributed under Meta's community license.",
  "use_cases": [
   "local inference",
   "fine-tuning",
   "benchmarking open models"
  ],
  "classification": "open_resource",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": "Llama 4 Community License Agreement",
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/meta-llama/llama-models",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Release table lists Llama 4 (4/5/2025) as the latest release",
     "Each release links its own license file"
    ],
    "summary": "Official repo lists Llama releases up to Llama 4, each with a separate license."
   },
   {
    "url": "https://github.com/meta-llama/llama-models/blob/main/models/llama4/LICENSE",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Title: LLAMA 4 COMMUNITY LICENSE AGREEMENT",
     "Services above 700 million monthly active users must request a license from Meta"
    ],
    "summary": "License file names the Llama 4 Community License and its large-scale user threshold."
   }
  ],
  "notes": "Community license is not an OSI open-source license; it carries use restrictions, so redistribution is left as unknown. llama.com now redirects to dev.meta.ai. Weights are free; compute/hosting is not.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "google-gemma",
  "kind": "tool",
  "name": "Google Gemma",
  "provider": "Google",
  "official_url": "https://ai.google.dev/gemma",
  "category": "ai_tool",
  "subjects": [
   "open-weight-llms",
   "fine-tuning",
   "local-inference"
  ],
  "description": "Google's family of lightweight open models that can be downloaded and run or fine-tuned locally.",
  "use_cases": [
   "local inference",
   "fine-tuning",
   "on-device experiments"
  ],
  "classification": "open_source",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": "Apache-2.0 (Gemma 4); earlier Gemma releases under Gemma Terms of Use",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://ai.google.dev/gemma/docs",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Gemma 4 is the latest release",
     "Docs link a 'Gemma 4 license'"
    ],
    "summary": "Gemma docs announce Gemma 4 and point to its license page."
   },
   {
    "url": "https://ai.google.dev/gemma/apache_2",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Page labeled 'Gemma 4 license' contains the Apache License 2.0 text"
    ],
    "summary": "The Gemma 4 license page is the Apache License 2.0."
   },
   {
    "url": "https://ai.google.dev/gemma/terms",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Gemma Terms of Use, last modified April 1, 2026",
     "Redistribution allowed with use restrictions and a notice file",
     "Appendix notes some models have separate licensing"
    ],
    "summary": "Gemma Terms of Use govern earlier Gemma models and allow conditional redistribution."
   }
  ],
  "notes": "Redistribution 'allowed' applies to Gemma 4 (Apache 2.0); older Gemma generations follow the Gemma Terms of Use with use restrictions. Compute/hosting not free.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "pinecone",
  "kind": "tool",
  "name": "Pinecone",
  "provider": "Pinecone Systems",
  "official_url": "https://www.pinecone.io/",
  "category": "ai_tool",
  "subjects": [
   "vector-databases",
   "retrieval-augmented-generation"
  ],
  "description": "A managed vector database service with a free Starter plan for building similarity search and RAG.",
  "use_cases": [
   "storing embeddings for RAG",
   "semantic search labs",
   "testing hosted embedding and rerank models"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [
   {
    "metric": "storage",
    "value": 2,
    "unit": "GB",
    "reset_period": null
   },
   {
    "metric": "write_units",
    "value": 2000000,
    "unit": "write units",
    "reset_period": "monthly"
   },
   {
    "metric": "read_units",
    "value": 1000000,
    "unit": "read units",
    "reset_period": "monthly"
   },
   {
    "metric": "egress",
    "value": 1,
    "unit": "GB",
    "reset_period": "monthly"
   },
   {
    "metric": "projects",
    "value": 1,
    "unit": "projects",
    "reset_period": null
   },
   {
    "metric": "users",
    "value": 2,
    "unit": "users",
    "reset_period": null
   },
   {
    "metric": "indexes",
    "value": 5,
    "unit": "indexes",
    "reset_period": null
   },
   {
    "metric": "embedding_tokens_llama-text-embed-v2",
    "value": 5000000,
    "unit": "tokens",
    "reset_period": "monthly"
   },
   {
    "metric": "embedding_tokens_multilingual-e5-large",
    "value": 5000000,
    "unit": "tokens",
    "reset_period": "monthly"
   },
   {
    "metric": "rerank_requests_bge-reranker-v2-m3",
    "value": 500,
    "unit": "requests",
    "reset_period": "monthly"
   },
   {
    "metric": "assistant_input_tokens",
    "value": 500000,
    "unit": "tokens",
    "reset_period": "monthly"
   },
   {
    "metric": "assistant_output_tokens",
    "value": 300000,
    "unit": "tokens",
    "reset_period": "monthly"
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "api",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.pinecone.io/pricing/",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Starter: up to 2 GB storage, 2M write units/mo, 1M read units/mo, 1 GB egress/mo",
     "1 project, up to 2 users, up to 5 indexes, AWS us-east-1 only",
     "Includes monthly embedding, rerank and Assistant token allowances"
    ],
    "summary": "Pricing page details the free Starter plan's storage, usage and model allowances."
   }
  ],
  "notes": "Starter is limited to AWS us-east-1; usage beyond allowances requires a paid plan. Credit-card requirement not stated on the page. account_required set true because it is a hosted service needing a project/API key (not explicitly quoted).",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "fastapi",
  "kind": "tool",
  "name": "FastAPI",
  "provider": "FastAPI (open-source project)",
  "official_url": "https://fastapi.tiangolo.com/",
  "category": "ai_tool",
  "subjects": [
   "python",
   "web-apis",
   "model-serving"
  ],
  "description": "An open-source Python framework for building web APIs, often used to serve ML models.",
  "use_cases": [
   "serving model inference endpoints",
   "building REST APIs",
   "backend for AI apps"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "free",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/fastapi/fastapi",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Licensed under the terms of the MIT license"
    ],
    "summary": "Official repository states FastAPI is MIT-licensed."
   }
  ],
  "notes": "Library is free; deploying an API to a server or cloud may cost money. account/card set false for the library itself (installed via pip).",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "streamlit",
  "kind": "tool",
  "name": "Streamlit",
  "provider": "Snowflake (Streamlit)",
  "official_url": "https://streamlit.io/",
  "category": "ai_tool",
  "subjects": [
   "python",
   "data-apps",
   "model-demos"
  ],
  "description": "An open-source Python library for turning scripts into interactive web apps, with a free community hosting service.",
  "use_cases": [
   "building ML demo apps",
   "dashboards",
   "sharing class projects"
  ],
  "classification": "open_source",
  "account_required": null,
  "payment_card_required": null,
  "api_access": "free",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/streamlit/streamlit",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Streamlit is free and open-source under Apache 2.0",
     "Apps can be deployed for free via Community Cloud"
    ],
    "summary": "Repo states the Apache 2.0 license and points to free Community Cloud hosting."
   },
   {
    "url": "https://streamlit.io/cloud",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Community Cloud described as totally free",
     "Sign in with GitHub",
     "Free tier is for public apps only"
    ],
    "summary": "Community Cloud page offers free public app hosting with GitHub sign-in."
   }
  ],
  "notes": "Library needs no account; Community Cloud hosting needs a GitHub account and supports public apps only. Community Cloud resource limits were not shown on the fetched page. Private/enterprise hosting (e.g., via Snowflake) costs money.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "unsloth",
  "kind": "tool",
  "name": "Unsloth",
  "provider": "Unsloth AI",
  "official_url": "https://unsloth.ai/",
  "category": "ai_tool",
  "subjects": [
   "fine-tuning",
   "open-weight-llms"
  ],
  "description": "An open-source library for faster, lower-memory fine-tuning of open-weight language models, with paid Pro and Enterprise editions.",
  "use_cases": [
   "LoRA/QLoRA fine-tuning in notebooks",
   "fine-tuning Llama, Mistral and Gemma models"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [],
  "license": "Apache-2.0 (core); AGPL-3.0 (optional components such as Unsloth Studio UI)",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/unslothai/unsloth",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Dual licensing: Apache 2.0 core, AGPL-3.0 for optional components like Studio UI"
    ],
    "summary": "Repo describes Apache 2.0 core with AGPL-3.0 optional components."
   },
   {
    "url": "https://unsloth.ai/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free open-source standard version",
     "Unsloth Pro and Enterprise offer faster training and multi-GPU/multi-node support",
     "Paid tier prices not listed (contact)"
    ],
    "summary": "Pricing page contrasts the free open-source version with contact-priced Pro and Enterprise tiers."
   }
  ],
  "notes": "Open-source version is free; Pro/Enterprise are paid with unpublished prices. GPU compute (e.g., Colab or cloud) may cost money. AGPL components carry copyleft obligations if redistributed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "langsmith",
  "kind": "tool",
  "name": "LangSmith",
  "provider": "LangChain",
  "official_url": "https://www.langchain.com/langsmith",
  "category": "ai_tool",
  "subjects": [
   "llm-observability",
   "llm-evaluation"
  ],
  "description": "LangChain's platform for tracing, monitoring and evaluating LLM applications, with a free single-seat Developer plan.",
  "use_cases": [
   "tracing agent runs",
   "evaluating prompts and RAG pipelines",
   "debugging LLM apps"
  ],
  "classification": "ongoing_free",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "mixed",
  "limits": [
   {
    "metric": "base_traces",
    "value": 5000,
    "unit": "traces",
    "reset_period": "monthly"
   },
   {
    "metric": "seats",
    "value": 1,
    "unit": "seats",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "api",
  "status": "verified",
  "evidence": [
   {
    "url": "https://www.langchain.com/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Developer plan: up to 5k base traces per month, then pay-as-you-go",
     "1 free seat",
     "Community support; no deployment features"
    ],
    "summary": "Pricing page lists the free Developer plan's monthly trace allowance and single seat."
   }
  ],
  "notes": "Usage beyond 5k traces/month is pay-as-you-go (page lists $1.00 per LSU). Card requirement not stated. account_required inferred from hosted SaaS sign-up, not explicitly quoted.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "ragas",
  "kind": "tool",
  "name": "RAGAS",
  "provider": "Ragas (explodinggradients)",
  "official_url": "https://github.com/explodinggradients/ragas",
  "category": "ai_tool",
  "subjects": [
   "llm-evaluation",
   "retrieval-augmented-generation"
  ],
  "description": "An open-source Python toolkit for evaluating retrieval-augmented generation and other LLM applications.",
  "use_cases": [
   "scoring RAG faithfulness and relevance",
   "building test sets",
   "comparing pipeline variants"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "free",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/explodinggradients/ragas",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository license is Apache-2.0"
    ],
    "summary": "Official repo shows RAGAS is Apache 2.0 licensed."
   }
  ],
  "notes": "Library is free, but many metrics call an LLM judge, so the underlying model API usage may be billed.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "trulens",
  "kind": "tool",
  "name": "TruLens",
  "provider": "TruEra / Snowflake (TruLens project)",
  "official_url": "https://github.com/truera/trulens",
  "category": "ai_tool",
  "subjects": [
   "llm-evaluation",
   "llm-observability"
  ],
  "description": "An open-source library for instrumenting and evaluating LLM apps and agents with feedback functions.",
  "use_cases": [
   "evaluating RAG groundedness",
   "tracking app experiments",
   "agent evaluation"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "free",
  "limits": [],
  "license": "MIT",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/truera/trulens",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository license is MIT"
    ],
    "summary": "Official repo indicates TruLens is MIT licensed."
   }
  ],
  "notes": "Library is free; LLM-based feedback functions may incur provider API costs.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "nvidia-nemo-guardrails",
  "kind": "tool",
  "name": "NVIDIA NeMo Guardrails",
  "provider": "NVIDIA",
  "official_url": "https://github.com/NVIDIA/NeMo-Guardrails",
  "category": "ai_tool",
  "subjects": [
   "ai-safety",
   "guardrails"
  ],
  "description": "An open-source toolkit for adding programmable safety and dialogue rails to LLM-based applications.",
  "use_cases": [
   "topic and safety rails for chatbots",
   "jailbreak and input checks",
   "dialogue flow control"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "free",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/NVIDIA/NeMo-Guardrails",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "The NeMo Guardrails library is licensed under Apache License 2.0"
    ],
    "summary": "Official repo states the library is Apache 2.0 licensed."
   }
  ],
  "notes": "Library is free; the LLMs and any hosted NVIDIA services it calls may cost money.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "guardrails-ai",
  "kind": "tool",
  "name": "Guardrails AI",
  "provider": "Guardrails AI",
  "official_url": "https://www.guardrailsai.com/",
  "category": "ai_tool",
  "subjects": [
   "ai-safety",
   "guardrails",
   "structured-output"
  ],
  "description": "An open-source Python framework for validating LLM inputs and outputs using reusable validators from a public hub.",
  "use_cases": [
   "output validation",
   "PII and toxicity checks",
   "structured output enforcement"
  ],
  "classification": "open_source",
  "account_required": false,
  "payment_card_required": false,
  "api_access": "free",
  "limits": [],
  "license": "Apache-2.0",
  "embedding": "unknown",
  "redistribution": "allowed",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "self_hosted",
  "status": "verified",
  "evidence": [
   {
    "url": "https://github.com/guardrails-ai/guardrails",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Repository license is Apache 2.0",
     "Guardrails Hub is a collection of pre-built validators",
     "Validators are moving to standard PyPI packages installed with pip"
    ],
    "summary": "Repo confirms Apache 2.0 and describes the validator hub moving to PyPI packages."
   }
  ],
  "notes": "Core library license confirmed; Hub validator licenses and any token/account requirement for the Hub were not confirmed and may vary per validator. Hosted/pro services, if any, not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 },
 {
  "id": "gamma",
  "kind": "tool",
  "name": "Gamma",
  "provider": "Gamma Tech",
  "official_url": "https://gamma.app/",
  "category": "ai_tool",
  "subjects": [
   "presentations",
   "generative-ai"
  ],
  "description": "An AI tool for generating presentations, documents and simple websites from prompts, with a credit-based free plan.",
  "use_cases": [
   "drafting slide decks",
   "creating one-page docs",
   "exporting to PPTX or PDF"
  ],
  "classification": "limited_credits",
  "account_required": true,
  "payment_card_required": null,
  "api_access": "unknown",
  "limits": [
   {
    "metric": "signup_credits",
    "value": 400,
    "unit": "credits",
    "reset_period": "none"
   },
   {
    "metric": "slides_per_prompt",
    "value": 10,
    "unit": "slides",
    "reset_period": null
   }
  ],
  "license": null,
  "embedding": "unknown",
  "redistribution": "unknown",
  "attribution_required": null,
  "certificate": null,
  "integration_method": "link",
  "status": "verified",
  "evidence": [
   {
    "url": "https://gamma.app/pricing",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "Free plan creates up to 10 slides per prompt",
     "Free plan imports PDF/PPTX and exports to PDF, PPTX, PNG and Google Slides"
    ],
    "summary": "Pricing page summarizes Free plan creation and import/export features."
   },
   {
    "url": "https://help.gamma.app/en/articles/7834324-how-do-ai-credits-work-in-gamma",
    "retrieved_at": "2026-10-04T00:00:00Z",
    "claims": [
     "New Free users receive 400 credits at sign-up",
     "Free plan credits do not refresh",
     "Credit cost varies by action and model"
    ],
    "summary": "Help article explains free users get one-time credits that do not renew."
   }
  ],
  "notes": "Free credits are one-time; more require referrals or a paid plan. Per-generation credit cost is variable and not listed. API availability on Free not checked.",
  "level": null,
  "est_hours": null,
  "prerequisites": [],
  "maps_to": []
 }
];
