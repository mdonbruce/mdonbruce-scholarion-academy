/**
 * Initial Scholarion Free Education Resource catalog — researched 2026-10-04 from official provider
 * pages (pricing, plan, docs, license and course pages). "verified" records had every stated limit
 * and classification confirmed on the fetched official page; everything else is "pending".
 * evidence.summary is the retrieval tool's summary of the page, not a verbatim quote.
 * The monthly terms review re-checks these pages automatically.
 */
export interface CatalogSeed {
  id: string; name: string; provider: string; official_url: string; category: string; subjects: string[]; description: string; use_cases: string[];
  classification: string; account_required: boolean | null; payment_card_required: boolean | null; api_access: string;
  limits: { metric: string; value: number | string; unit: string; reset_period: string | null }[];
  license: string | null; embedding: string; redistribution: string; attribution_required: boolean | null; certificate: string | null;
  integration_method: string; status: "verified" | "pending"; evidence: { url: string; retrieved_at: string; claims: string[]; summary: string | null }[]; notes: string;
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
  "notes": "Account needed to host (not re-verified on fetched page beyond plan context). Payment card requirement not confirmed; API/SDK terms not checked."
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
  "notes": "Account requirement inferred from sign-up flow (redirect to signup.webex.com), not quoted. API terms not checked."
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
  "notes": "Support article support.google.com/meet/answer/10317867 returned 404; claims taken from product page. Page says 60-min cap applies generally with exception for 1:1 and mobile calls; the '3+ participants' framing is an interpretation of 'group'. payment_card_required=false assumed from 'no cost' with Google Account - treat cautiously."
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
  "notes": "meet.jit.si direct fetch returned no content. Marketing page claims no account needed; the public instance may require moderator sign-in in practice - verify before relying. Embedding via IFrame API / JaaS not verified here; self-hosting costs are separate."
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
  "notes": "Free software; server hosting and operations costs are separate. Embedding/API (BBB API) not verified on fetched page."
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
  "notes": "License covers the Ollama software only; individual models have their own licenses. Any Ollama cloud/hosted offering not checked. Local hardware costs separate."
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
  "notes": "Hub browsing/hosting with a free account is free; Inference Providers API is credit-based (small free monthly credit, then paid). Free-account storage quotas not confirmed. Classification reflects inference credits; Hub itself is ongoing free."
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
  "notes": "GPU availability, memory and idle timeouts are not published and vary. Google Account required (assumed; not quoted). payment_card_required=false based on 'free of charge'."
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
  "notes": "Library is free; LangGraph Platform/LangSmith hosted services and LLM API costs are separate and not checked."
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
  "notes": "License identified as MIT from LICENSE file text, but the quoted grant phrase is standard MIT wording not echoed verbatim by the fetch tool; re-confirm quote. Hosted CrewAI platform and LLM API costs separate."
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
  "notes": "Covers the open-source repo only; OpenAI's hosted transcription API is paid and separate (not checked). Local compute costs separate."
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
  "notes": "Pending: API availability on the free plan not confirmed on fetched pages (elevenlabs.io/pricing/api mentions 'Start for free' but no free quota). Credit-to-character conversion not confirmed."
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
  "notes": "Pending: fetch summary reported the 1-minute length, watermark and no-API details but only '3 videos per month' was returned as an exact quote; re-verify wording. HeyGen API has separate pricing not checked."
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
  "notes": "Pending: trial length, credits/minutes, card requirement and API trial terms not stated on fetched official pages."
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
  "notes": "COPYING shows GPL v2 text; project may be 'GPL-2.0-or-later' - not confirmed."
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
  "notes": "Original rhasspy/piper (MIT) was archived Oct 6, 2025 (confirmed at https://github.com/rhasspy/piper/blob/master/LICENSE.md); active development is OHF-Voice/piper1-gpl under GPL-3.0. Successor relationship not explicitly stated on fetched page. Voice models have their own licenses."
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
  "notes": "Code license only; pretrained models (e.g., XTTS) may carry separate, more restrictive licenses - not checked. Maintenance status of repo not checked."
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
  "notes": "Category 'reading' used as closest fit for a study/instructional tool. Excalidraw+ paid tier not checked. Free web app at excalidraw.com."
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
  "notes": "Desktop is free; official iOS app AnkiMobile is paid (supports development). Category 'reading' used as closest fit."
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
  "notes": "Plugins available for Moodle/WordPress/Drupal; H5P.com hosted service is paid (not checked). Category 'reading' used as closest fit."
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
  "notes": "Non-commercial restriction matters if the platform charges tuition - review before redistribution. Some third-party content in courses may be excluded from the license. Certificate 'none' inferred (no certificate offering on fetched page)."
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
  "notes": "No formal license stated - informal permission only; redistribution/embedding rights unclear, so status pending. Certificate 'none' for public materials is an inference."
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
  "notes": "Check each title's license page; older versions may remain CC BY. Non-commercial restriction applies to newer titles."
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
  "notes": "No certificate info on page. License of course materials not stated on fetched page. account_required=false inferred from open site."
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
  "notes": "Certificate deadlines/availability may change; content license not checked. Some exercises may use inference credits."
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
  "notes": "Pending: certificate terms not confirmed (kaggle.com/learn-course-certificates returned only metadata). Account requirement not confirmed."
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
  "notes": "Account required for earning certifications likely but not confirmed. Content license not checked."
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
  "notes": "Pending: fetched official pages did not state whether short courses are currently free, or any beta/limited-time terms. Prices not shown."
 }
];
