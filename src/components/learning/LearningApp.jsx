'use client'
/* eslint-disable */
// ============================================================================
// iORA Learning Hub — ported from the standalone iORALMS Vite SPA into the HRMS
// Next.js app. Authored as global-scope .jsx concatenated at build time; this
// bundle is the mechanical port of those sources (see scratchpad/port.js).
//
// Differences from the original SPA:
//  - identity (name/role) comes from the HRMS session, not a hardcoded user
//  - progress is seeded from and synced to the HRMS backend (not localStorage)
//  - the dev tweaks panel and the change-password modal are removed
//  - "My Profile" links back into the HRMS profile page
// ============================================================================
import React from 'react'

const LMS_CSS = ":root {\r\n        --navy: #1d1b18;\r\n        --navy-2: #262320;\r\n        --navy-3: #37322c;\r\n        --green: #2bbd6b;\r\n        --blue: #1d1b18;\r\n        --blue-d: #000000;\r\n        --red: #c0493a;\r\n        --violet: #6c655b;\r\n        --bg: #f5f4f0;\r\n        --panel: #ffffff;\r\n        --thumb: #e7e3d9;\r\n        --thumb-2: #d9d4c8;\r\n        --ink: #211e1a;\r\n        --ink-2: #5f5a52;\r\n        --ink-3: #9c948a;\r\n        --line: #e8e3da;\r\n        /* chrome = top nav + sidebar surfaces — light & airy by default, like the iORA storefront */\r\n        --chrome-bg: #ffffff;\r\n        --chrome-ink: #211e1a;\r\n        --chrome-ink-2: #5f5a52;\r\n        --chrome-ink-3: #9c948a;\r\n        --chrome-line: #ebe7df;\r\n        --chrome-hover: rgba(0, 0, 0, 0.05);\r\n        --chrome-card: #faf9f6;\r\n        --font: \"Public Sans\", system-ui, sans-serif;\r\n        --shadow:\r\n          0 1px 2px rgba(44, 62, 80, 0.06), 0 6px 18px rgba(44, 62, 80, 0.08);\r\n        --shadow-lg: 0 12px 40px rgba(44, 62, 80, 0.18);\r\n        --radius: 12px;\r\n      }\r\n      * {\r\n        box-sizing: border-box;\r\n      }\r\n      html,\r\n      body {\r\n        margin: 0;\r\n        height: 100%;\r\n      }\r\n      body {\r\n        font-family: var(--font), \"Noto Sans SC\", sans-serif;\r\n        color: var(--ink);\r\n        background: var(--navy);\r\n        -webkit-font-smoothing: antialiased;\r\n        text-rendering: optimizeLegibility;\r\n      }\r\n      button {\r\n        font-family: inherit;\r\n        cursor: pointer;\r\n        border: none;\r\n        background: none;\r\n        color: inherit;\r\n      }\r\n      :focus-visible {\r\n        outline: 2px solid var(--blue);\r\n        outline-offset: 2px;\r\n      }\r\n      @media (prefers-reduced-motion: reduce) {\r\n        *,\r\n        *::before,\r\n        *::after {\r\n          animation-duration: 0.01ms !important;\r\n          transition-duration: 0.01ms !important;\r\n        }\r\n      }\r\n      h1,\r\n      h2,\r\n      h3,\r\n      p {\r\n        margin: 0;\r\n      }\r\n      ::selection {\r\n        background: rgba(43, 189, 107, 0.2);\r\n      }\r\n\r\n      .app {\r\n        display: flex;\r\n        flex-direction: column;\r\n        height: 100vh;\r\n        height: 100dvh;\r\n        background: var(--bg);\r\n      }\r\n\r\n      /* ---------- buttons ---------- */\r\n      .btn {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        gap: 8px;\r\n        font-weight: 600;\r\n        font-size: 15px;\r\n        padding: 11px 18px;\r\n        border-radius: 9px;\r\n        transition: 0.16s;\r\n        white-space: nowrap;\r\n        line-height: 1;\r\n        text-decoration: none;\r\n      }\r\n      .btn:not(:disabled):active {\r\n        transform: scale(0.97);\r\n      }\r\n      .btn:disabled {\r\n        opacity: 0.45;\r\n        cursor: not-allowed;\r\n      }\r\n      .btn-blue {\r\n        background: var(--blue);\r\n        color: #fff;\r\n      }\r\n      .btn-blue:not(:disabled):hover {\r\n        background: var(--blue-d);\r\n      }\r\n      .btn-green {\r\n        background: var(--green);\r\n        color: #fff;\r\n      }\r\n      .btn-green:not(:disabled):hover {\r\n        filter: brightness(0.94);\r\n      }\r\n      .btn-ghost {\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n        box-shadow: inset 0 0 0 1.5px var(--line);\r\n      }\r\n      .btn-ghost:not(:disabled):hover {\r\n        background: var(--bg);\r\n        box-shadow: inset 0 0 0 1.5px var(--ink-3);\r\n      }\r\n      .btn-block {\r\n        width: 100%;\r\n        justify-content: center;\r\n      }\r\n      .btn.sm {\r\n        padding: 8px 13px;\r\n        font-size: 13.5px;\r\n      }\r\n      .btn.lg {\r\n        padding: 14px 24px;\r\n        font-size: 16px;\r\n      }\r\n      .icon-btn {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        width: 36px;\r\n        height: 36px;\r\n        border-radius: 8px;\r\n        color: var(--ink-2);\r\n        transition: 0.15s;\r\n      }\r\n      .icon-btn:hover {\r\n        background: var(--line);\r\n        color: var(--ink);\r\n      }\r\n\r\n      /* ---------- top nav ---------- */\r\n      .topnav {\r\n        height: 64px;\r\n        flex: 0 0 64px;\r\n        background: var(--chrome-bg);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        padding: 0 24px;\r\n        position: relative;\r\n        z-index: 40;\r\n        border-bottom: 1px solid var(--chrome-line);\r\n      }\r\n      .brand {\r\n        display: flex;\r\n        flex-direction: column;\r\n        justify-content: center;\r\n        line-height: 1;\r\n        gap: 2px;\r\n      }\r\n      .brand-word {\r\n        font-family: \"Cormorant Garamond\", serif;\r\n        font-weight: 700;\r\n        font-size: 34px;\r\n        color: var(--chrome-ink);\r\n        letter-spacing: 0.5px;\r\n      }\r\n      .brand-sub {\r\n        font-size: 10.5px;\r\n        font-weight: 600;\r\n        letter-spacing: 2px;\r\n        text-transform: uppercase;\r\n        color: var(--chrome-ink-3);\r\n      }\r\n      .nav-right {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 8px;\r\n        position: relative;\r\n      }\r\n      .nav-icon {\r\n        position: relative;\r\n        width: 42px;\r\n        height: 42px;\r\n        border-radius: 10px;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        color: var(--chrome-ink-2);\r\n        transition: 0.15s;\r\n      }\r\n      .nav-icon:hover,\r\n      .nav-icon.on {\r\n        background: var(--chrome-hover);\r\n        color: var(--chrome-ink);\r\n      }\r\n      .badge {\r\n        position: absolute;\r\n        top: 5px;\r\n        right: 6px;\r\n        min-width: 17px;\r\n        height: 17px;\r\n        padding: 0 4px;\r\n        border-radius: 9px;\r\n        background: var(--red);\r\n        color: #fff;\r\n        font-size: 11px;\r\n        font-weight: 700;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        box-shadow: 0 0 0 2px var(--chrome-bg);\r\n      }\r\n      .nav-user {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 9px;\r\n        padding: 5px 8px 5px 12px;\r\n        border-radius: 10px;\r\n        color: var(--chrome-ink);\r\n        transition: 0.15s;\r\n      }\r\n      .nav-user:hover {\r\n        background: var(--chrome-hover);\r\n      }\r\n      .user-name {\r\n        font-size: 14.5px;\r\n        font-weight: 600;\r\n      }\r\n      .avatar {\r\n        width: 36px;\r\n        height: 36px;\r\n        border-radius: 50%;\r\n        background: var(--chrome-hover);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        color: var(--chrome-ink);\r\n      }\r\n      .avatar.lg {\r\n        width: 46px;\r\n        height: 46px;\r\n      }\r\n      .lang-pill {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 7px;\r\n        background: var(--chrome-hover);\r\n        color: var(--chrome-ink);\r\n        font-weight: 600;\r\n        font-size: 14px;\r\n        padding: 9px 14px;\r\n        border-radius: 9px;\r\n        margin-left: 4px;\r\n        transition: 0.15s;\r\n        box-shadow: inset 0 0 0 1px var(--chrome-line);\r\n      }\r\n      .lang-pill:hover {\r\n        background: var(--chrome-card);\r\n      }\r\n      .lang-label-sm {\r\n        display: none;\r\n      }\r\n\r\n      /* ---------- dropdowns ---------- */\r\n      .dropdown {\r\n        position: absolute;\r\n        top: 56px;\r\n        background: var(--panel);\r\n        border-radius: 12px;\r\n        box-shadow: var(--shadow-lg);\r\n        z-index: 50;\r\n        overflow: hidden;\r\n        animation: pop 0.14s ease;\r\n      }\r\n      @keyframes pop {\r\n        from {\r\n          opacity: 0;\r\n          transform: translateY(-6px);\r\n        }\r\n        to {\r\n          opacity: 1;\r\n          transform: none;\r\n        }\r\n      }\r\n      .dd-lang {\r\n        right: 0;\r\n        min-width: 210px;\r\n        padding: 6px;\r\n      }\r\n      .dd-notif {\r\n        right: 64px;\r\n        width: 340px;\r\n      }\r\n      .dd-profile {\r\n        right: 120px;\r\n        width: 268px;\r\n        padding: 6px;\r\n      }\r\n      .dd-item {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 11px;\r\n        width: 100%;\r\n        padding: 11px 12px;\r\n        border-radius: 8px;\r\n        font-size: 14.5px;\r\n        font-weight: 500;\r\n        color: var(--ink);\r\n        transition: 0.13s;\r\n        text-align: left;\r\n      }\r\n      .dd-item:hover {\r\n        background: var(--line);\r\n      }\r\n      .dd-item.active {\r\n        color: var(--blue);\r\n        font-weight: 600;\r\n      }\r\n      .dd-item.danger {\r\n        color: var(--red);\r\n      }\r\n      .dd-item.danger:hover {\r\n        background: color-mix(in srgb, var(--red) 9%, var(--panel));\r\n      }\r\n      .lang-short {\r\n        width: 24px;\r\n        height: 24px;\r\n        border-radius: 6px;\r\n        background: var(--line);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        font-size: 11px;\r\n        font-weight: 700;\r\n        color: var(--ink-2);\r\n      }\r\n      .dd-sep {\r\n        height: 1px;\r\n        background: var(--line);\r\n        margin: 6px 4px;\r\n      }\r\n      .dd-head {\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        padding: 14px 16px;\r\n        border-bottom: 1px solid var(--line);\r\n        font-weight: 700;\r\n        font-size: 15px;\r\n      }\r\n      .dd-link {\r\n        color: var(--blue);\r\n        font-size: 13px;\r\n        font-weight: 600;\r\n      }\r\n      .notif-list {\r\n        max-height: 360px;\r\n        overflow: auto;\r\n      }\r\n      .notif-empty {\r\n        padding: 28px 16px;\r\n        text-align: center;\r\n        color: var(--ink-3);\r\n        font-size: 14px;\r\n      }\r\n      .notif {\r\n        display: flex;\r\n        gap: 11px;\r\n        padding: 13px 16px;\r\n        border-bottom: 1px solid var(--line);\r\n      }\r\n      .notif.unread {\r\n        background: rgba(43, 189, 107, 0.08);\r\n      }\r\n      .notif-dot {\r\n        width: 9px;\r\n        height: 9px;\r\n        border-radius: 50%;\r\n        margin-top: 6px;\r\n        flex: 0 0 9px;\r\n        background: var(--ink-3);\r\n      }\r\n      .notif-dot.due {\r\n        background: var(--blue);\r\n      }\r\n      .notif-dot.info {\r\n        background: var(--ink-3);\r\n      }\r\n      .notif-dot.done {\r\n        background: var(--green);\r\n      }\r\n      .notif-dot.alert {\r\n        background: var(--red);\r\n      }\r\n      .notif-text {\r\n        font-size: 14px;\r\n        line-height: 1.4;\r\n        color: var(--ink);\r\n      }\r\n      .notif-time {\r\n        font-size: 12px;\r\n        color: var(--ink-3);\r\n        margin-top: 3px;\r\n      }\r\n      .profile-head {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 12px;\r\n        padding: 14px 12px 12px;\r\n      }\r\n      .profile-head .avatar {\r\n        background: var(--navy);\r\n      }\r\n      .pf-name {\r\n        font-weight: 700;\r\n        font-size: 15.5px;\r\n      }\r\n      .pf-role {\r\n        font-size: 12.5px;\r\n        color: var(--ink-3);\r\n        margin-top: 2px;\r\n      }\r\n\r\n      /* ---------- body / sidebar ---------- */\r\n      .app-body {\r\n        flex: 1;\r\n        display: flex;\r\n        min-height: 0;\r\n      }\r\n      .sidebar {\r\n        flex: 0 0 300px;\r\n        background: var(--chrome-bg);\r\n        color: var(--chrome-ink);\r\n        border-right: 1px solid var(--chrome-line);\r\n        padding: 30px 26px;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 24px;\r\n        overflow: auto;\r\n      }\r\n      .ring-block {\r\n        padding: 6px 2px 0;\r\n      }\r\n      .ring-wrap {\r\n        position: relative;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n      }\r\n      .ring-svg {\r\n        transform: rotate(0);\r\n      }\r\n      .ring-label {\r\n        position: absolute;\r\n        inset: 0;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        justify-content: center;\r\n        text-align: center;\r\n        gap: 2px;\r\n      }\r\n      .ring-cap {\r\n        font-size: 12.5px;\r\n        font-weight: 600;\r\n        color: rgba(255, 255, 255, 0.7);\r\n        max-width: 120px;\r\n        line-height: 1.2;\r\n      }\r\n      .ring-pct {\r\n        font-size: 38px;\r\n        font-weight: 800;\r\n        line-height: 1;\r\n        color: #fff;\r\n      }\r\n      .side-card {\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n        border-radius: var(--radius);\r\n        padding: 18px;\r\n        box-shadow: var(--shadow);\r\n      }\r\n      .side-card-h {\r\n        font-size: 13px;\r\n        font-weight: 700;\r\n        text-transform: uppercase;\r\n        letter-spacing: 0.6px;\r\n        color: var(--ink-3);\r\n        margin-bottom: 13px;\r\n      }\r\n      .upcoming-item {\r\n        display: flex;\r\n        gap: 11px;\r\n        align-items: flex-start;\r\n        color: var(--blue);\r\n      }\r\n      .upcoming-item > div {\r\n        color: var(--ink);\r\n      }\r\n      .up-title {\r\n        font-weight: 700;\r\n        font-size: 15px;\r\n        line-height: 1.3;\r\n      }\r\n      .up-date {\r\n        font-size: 13px;\r\n        color: var(--ink-3);\r\n        margin-top: 3px;\r\n      }\r\n      .up-empty {\r\n        font-size: 14px;\r\n        color: var(--ink-2);\r\n        line-height: 1.4;\r\n      }\r\n      .cert-block {\r\n        background: var(--chrome-card);\r\n        border: 1px solid var(--chrome-line);\r\n        border-radius: var(--radius);\r\n        padding: 16px;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 13px;\r\n      }\r\n      .cert-ready {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 9px;\r\n        font-size: 13.5px;\r\n        font-weight: 600;\r\n        color: var(--green);\r\n      }\r\n\r\n      /* ---------- main ---------- */\r\n      .main {\r\n        flex: 1;\r\n        overflow: auto;\r\n        padding: clamp(18px, 4vw, 34px) clamp(16px, 4.5vw, 40px)\r\n          clamp(28px, 6vw, 40px);\r\n      }\r\n\r\n      /* ---------- dashboard ---------- */\r\n      .dash-head {\r\n        margin-bottom: 24px;\r\n      }\r\n      .dash-head h1 {\r\n        font-size: clamp(22px, 4.5vw, 27px);\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n        letter-spacing: -0.3px;\r\n      }\r\n      .card-grid {\r\n        display: grid;\r\n        grid-template-columns: repeat(2, 1fr);\r\n        gap: 24px;\r\n        max-width: 980px;\r\n      }\r\n      .lcard {\r\n        display: block;\r\n        text-align: left;\r\n        border-radius: var(--radius);\r\n        overflow: hidden;\r\n        background: var(--panel);\r\n        box-shadow: var(--shadow);\r\n        transition: 0.18s;\r\n        position: relative;\r\n        padding: 0;\r\n      }\r\n      .lcard:not(.is-locked):hover {\r\n        transform: translateY(-3px);\r\n        box-shadow: var(--shadow-lg);\r\n      }\r\n      .lcard.is-locked {\r\n        cursor: not-allowed;\r\n      }\r\n      .lcard-thumb {\r\n        position: relative;\r\n        height: clamp(140px, 24vw, 190px);\r\n      }\r\n      .thumb {\r\n        position: absolute;\r\n        inset: 0;\r\n        background: var(--thumb);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n      }\r\n      .thumb.locked {\r\n        filter: grayscale(0.3);\r\n      }\r\n      .thumb-stripes {\r\n        position: absolute;\r\n        inset: 0;\r\n        background-image: repeating-linear-gradient(\r\n          45deg,\r\n          rgba(255, 255, 255, 0.35) 0 2px,\r\n          transparent 2px 11px\r\n        );\r\n        opacity: 0.5;\r\n      }\r\n      .thumb-tag {\r\n        position: relative;\r\n        font-family: ui-monospace, monospace;\r\n        font-size: 12px;\r\n        color: #7c8388;\r\n        letter-spacing: 0.4px;\r\n        background: rgba(255, 255, 255, 0.55);\r\n        padding: 5px 10px;\r\n        border-radius: 6px;\r\n      }\r\n      .lcard.is-locked .lcard-thumb::after {\r\n        content: \"\";\r\n        position: absolute;\r\n        inset: 0;\r\n        background: rgba(28, 26, 23, 0.14);\r\n      }\r\n      .lock-badge {\r\n        position: absolute;\r\n        top: 12px;\r\n        right: 12px;\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 6px;\r\n        background: var(--panel);\r\n        color: var(--violet);\r\n        font-size: 13px;\r\n        font-weight: 700;\r\n        padding: 6px 11px;\r\n        border-radius: 8px;\r\n        box-shadow: var(--shadow);\r\n        z-index: 2;\r\n      }\r\n      .done-badge {\r\n        position: absolute;\r\n        top: 12px;\r\n        right: 12px;\r\n        width: 30px;\r\n        height: 30px;\r\n        border-radius: 50%;\r\n        background: var(--green);\r\n        color: #fff;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        box-shadow: var(--shadow);\r\n        z-index: 2;\r\n      }\r\n      .lcard-foot {\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        padding: 15px 18px;\r\n        border-top: 1px solid var(--line);\r\n      }\r\n      .lcard-title {\r\n        font-size: 18px;\r\n        font-weight: 700;\r\n        white-space: nowrap;\r\n      }\r\n      .lcard-pct {\r\n        font-size: 16px;\r\n        font-weight: 700;\r\n      }\r\n      .lcard-bar {\r\n        height: 6px;\r\n        background: rgba(0, 0, 0, 0.07);\r\n      }\r\n      .lcard-bar span {\r\n        display: block;\r\n        height: 100%;\r\n        transition: width 0.6s ease;\r\n      }\r\n\r\n      /* ---------- player shared ---------- */\r\n      .player {\r\n        max-width: 980px;\r\n        margin: 0 auto;\r\n      }\r\n      .player-head {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 14px;\r\n        margin-bottom: 20px;\r\n      }\r\n      .player-head .back {\r\n        align-self: flex-start;\r\n      }\r\n      .player-kicker {\r\n        font-size: 13px;\r\n        font-weight: 700;\r\n        letter-spacing: 0.5px;\r\n        text-transform: uppercase;\r\n        color: var(--blue);\r\n      }\r\n      .player-titles h1 {\r\n        font-size: clamp(20px, 4.5vw, 26px);\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n        margin-top: 5px;\r\n        letter-spacing: -0.3px;\r\n      }\r\n      .part {\r\n        background: var(--panel);\r\n        border-radius: var(--radius);\r\n        box-shadow: var(--shadow);\r\n        overflow: hidden;\r\n      }\r\n\r\n      /* slides */\r\n      .slide-nav {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 16px;\r\n        padding: 16px 24px;\r\n        border-top: 1px solid var(--line);\r\n      }\r\n\r\n      /* pdf */\r\n      .pdf-doc {\r\n        background: var(--thumb);\r\n        display: flex;\r\n        justify-content: center;\r\n      }\r\n      .pdf-nav {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 12px;\r\n        padding: 14px 20px;\r\n        border-top: 1px solid var(--line);\r\n      }\r\n      .pdf-nav .ml {\r\n        margin-left: auto;\r\n      }\r\n\r\n      /* video */\r\n      .video-frame {\r\n        position: relative;\r\n        width: 100%;\r\n        aspect-ratio: 16/9;\r\n        background: #000;\r\n      }\r\n      .video-frame iframe {\r\n        position: absolute;\r\n        inset: 0;\r\n        width: 100%;\r\n        height: 100%;\r\n        border: 0;\r\n      }\r\n      .video-meta {\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        gap: 16px;\r\n        padding: 18px 24px;\r\n      }\r\n      .video-meta h2 {\r\n        font-size: 19px;\r\n        font-weight: 700;\r\n        color: var(--ink);\r\n      }\r\n\r\n      /* classic layout */\r\n      .step-row {\r\n        display: flex;\r\n        gap: 12px;\r\n        margin-bottom: 22px;\r\n        flex-wrap: wrap;\r\n      }\r\n      .step-chip {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 9px;\r\n        padding: 11px 16px;\r\n        border-radius: 10px;\r\n        background: var(--panel);\r\n        box-shadow: var(--shadow);\r\n        font-size: 14.5px;\r\n        font-weight: 600;\r\n        color: var(--ink-2);\r\n        transition: 0.15s;\r\n        flex: 1;\r\n        min-width: 140px;\r\n      }\r\n      .step-chip .step-ic {\r\n        width: 26px;\r\n        height: 26px;\r\n        border-radius: 7px;\r\n        background: var(--line);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        color: var(--ink-3);\r\n      }\r\n      .step-chip.active {\r\n        box-shadow:\r\n          inset 0 0 0 2px var(--blue),\r\n          var(--shadow);\r\n        color: var(--ink);\r\n      }\r\n      .step-chip.active .step-ic {\r\n        background: var(--blue);\r\n        color: #fff;\r\n      }\r\n      .step-chip.done .step-ic {\r\n        background: var(--green);\r\n        color: #fff;\r\n      }\r\n      .step-chip.done {\r\n        color: var(--ink);\r\n      }\r\n      .step-chip.locked {\r\n        opacity: 0.5;\r\n        cursor: not-allowed;\r\n      }\r\n\r\n      /* stepper layout */\r\n      .stepper-body {\r\n        display: flex;\r\n        gap: 26px;\r\n        align-items: flex-start;\r\n      }\r\n      .step-rail {\r\n        flex: 0 0 230px;\r\n        display: flex;\r\n        flex-direction: column;\r\n        background: var(--panel);\r\n        border-radius: var(--radius);\r\n        box-shadow: var(--shadow);\r\n        padding: 10px;\r\n      }\r\n      .rail-item {\r\n        position: relative;\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 13px;\r\n        padding: 14px 14px;\r\n        border-radius: 9px;\r\n        text-align: left;\r\n        transition: 0.14s;\r\n        color: var(--ink-2);\r\n      }\r\n      .rail-item:not(:disabled):hover {\r\n        background: var(--line);\r\n      }\r\n      .rail-ic {\r\n        width: 34px;\r\n        height: 34px;\r\n        border-radius: 9px;\r\n        background: var(--line);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        color: var(--ink-3);\r\n        flex: 0 0 34px;\r\n        z-index: 2;\r\n      }\r\n      .rail-txt {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 2px;\r\n      }\r\n      .rail-txt b {\r\n        font-size: 15px;\r\n        font-weight: 700;\r\n        color: inherit;\r\n      }\r\n      .rail-txt small {\r\n        font-size: 12px;\r\n        color: var(--ink-3);\r\n      }\r\n      .rail-item.active {\r\n        color: var(--ink);\r\n      }\r\n      .rail-item.active .rail-ic {\r\n        background: var(--blue);\r\n        color: #fff;\r\n      }\r\n      .rail-item.done .rail-ic {\r\n        background: var(--green);\r\n        color: #fff;\r\n      }\r\n      .rail-item.locked {\r\n        opacity: 0.5;\r\n        cursor: not-allowed;\r\n      }\r\n      .rail-line {\r\n        position: absolute;\r\n        left: 30px;\r\n        top: 48px;\r\n        bottom: -2px;\r\n        width: 2px;\r\n        background: var(--line);\r\n        z-index: 1;\r\n      }\r\n      .stepper-content {\r\n        flex: 1;\r\n        min-width: 0;\r\n      }\r\n\r\n      /* focused layout */\r\n      .player-focused {\r\n        max-width: 840px;\r\n      }\r\n      .focus-top {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 16px;\r\n        margin-bottom: 22px;\r\n      }\r\n      .seg-bar {\r\n        flex: 1;\r\n        display: flex;\r\n        gap: 6px;\r\n      }\r\n      .seg {\r\n        flex: 1;\r\n        height: 8px;\r\n        border-radius: 5px;\r\n        background: var(--thumb-2);\r\n        transition: 0.18s;\r\n      }\r\n      .seg.done {\r\n        background: var(--green);\r\n      }\r\n      .seg.active {\r\n        background: var(--navy);\r\n      }\r\n      .seg.locked {\r\n        opacity: 0.6;\r\n      }\r\n      .focus-name {\r\n        font-size: 14px;\r\n        font-weight: 700;\r\n        color: var(--ink);\r\n        max-width: 200px;\r\n        overflow: hidden;\r\n        text-overflow: ellipsis;\r\n        white-space: nowrap;\r\n      }\r\n      .focus-kicker {\r\n        font-size: 12.5px;\r\n        font-weight: 700;\r\n        letter-spacing: 1px;\r\n        text-transform: uppercase;\r\n        color: var(--blue);\r\n        margin-bottom: 12px;\r\n      }\r\n\r\n      /* ---------- quiz ---------- */\r\n      .quiz {\r\n        padding: clamp(20px, 4vw, 30px) clamp(16px, 4.5vw, 32px);\r\n      }\r\n      .quiz-top {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 14px;\r\n        margin-bottom: 18px;\r\n      }\r\n      .quiz-step {\r\n        font-size: 14px;\r\n        font-weight: 700;\r\n        color: var(--ink);\r\n        white-space: nowrap;\r\n      }\r\n      .quiz-step .dim {\r\n        color: var(--ink-3);\r\n        font-weight: 500;\r\n      }\r\n      .quiz-progress {\r\n        flex: 1;\r\n        height: 7px;\r\n        border-radius: 5px;\r\n        background: var(--line);\r\n        overflow: hidden;\r\n      }\r\n      .quiz-progress span {\r\n        display: block;\r\n        height: 100%;\r\n        background: var(--blue);\r\n        transition: width 0.3s;\r\n      }\r\n      .quiz-attempt {\r\n        font-size: 12.5px;\r\n        font-weight: 600;\r\n        color: var(--red);\r\n        white-space: nowrap;\r\n      }\r\n      .quiz-q {\r\n        font-size: clamp(17px, 4vw, 21px);\r\n        font-weight: 700;\r\n        color: var(--ink);\r\n        line-height: 1.4;\r\n        margin-bottom: 20px;\r\n      }\r\n      .quiz-opts {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 11px;\r\n      }\r\n      .opt {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 13px;\r\n        padding: 15px 17px;\r\n        border-radius: 10px;\r\n        text-align: left;\r\n        background: var(--panel);\r\n        box-shadow: inset 0 0 0 1.5px var(--line);\r\n        font-size: 16px;\r\n        color: var(--ink);\r\n        transition: 0.13s;\r\n      }\r\n      .opt:not(:disabled):hover {\r\n        box-shadow: inset 0 0 0 1.5px var(--ink-3);\r\n        background: var(--bg);\r\n      }\r\n      .opt-mark {\r\n        width: 30px;\r\n        height: 30px;\r\n        border-radius: 8px;\r\n        background: var(--line);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        font-weight: 700;\r\n        font-size: 14px;\r\n        color: var(--ink-2);\r\n        flex: 0 0 30px;\r\n      }\r\n      .opt-text {\r\n        flex: 1;\r\n      }\r\n      .opt.picked {\r\n        box-shadow: inset 0 0 0 2px var(--blue);\r\n        background: color-mix(in srgb, var(--blue) 10%, var(--panel));\r\n      }\r\n      .opt.picked .opt-mark {\r\n        background: var(--blue);\r\n        color: #fff;\r\n      }\r\n      .opt.correct {\r\n        box-shadow: inset 0 0 0 2px var(--green);\r\n        background: color-mix(in srgb, var(--green) 12%, var(--panel));\r\n        color: var(--ink);\r\n      }\r\n      .opt.correct .opt-mark {\r\n        background: var(--green);\r\n        color: #fff;\r\n      }\r\n      .opt.wrong {\r\n        box-shadow: inset 0 0 0 2px var(--red);\r\n        background: color-mix(in srgb, var(--red) 10%, var(--panel));\r\n      }\r\n      .opt.wrong .opt-mark {\r\n        background: var(--red);\r\n        color: #fff;\r\n      }\r\n      .opt.muted {\r\n        opacity: 0.55;\r\n      }\r\n      .quiz-foot {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 16px;\r\n        margin-top: 24px;\r\n      }\r\n      .quiz-foot .btn {\r\n        margin-left: auto;\r\n      }\r\n      .feedback {\r\n        font-weight: 700;\r\n        font-size: 15px;\r\n      }\r\n      .feedback.ok {\r\n        color: var(--green);\r\n      }\r\n      .feedback.no {\r\n        color: var(--red);\r\n      }\r\n\r\n      /* quiz result */\r\n      .quiz-result {\r\n        padding: 44px 32px;\r\n        text-align: center;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        gap: 14px;\r\n      }\r\n      .result-ring {\r\n        width: 96px;\r\n        height: 96px;\r\n        border-radius: 50%;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n      }\r\n      .result-ring.pass {\r\n        background: color-mix(in srgb, var(--green) 12%, var(--panel));\r\n        color: var(--green);\r\n      }\r\n      .result-ring.fail {\r\n        background: color-mix(in srgb, var(--red) 10%, var(--panel));\r\n        color: var(--red);\r\n      }\r\n      .quiz-result h2 {\r\n        font-size: 26px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .result-score {\r\n        font-size: 17px;\r\n        color: var(--ink-2);\r\n      }\r\n      .result-score b {\r\n        color: var(--ink);\r\n        font-size: 20px;\r\n      }\r\n      .result-meta {\r\n        font-size: 13.5px;\r\n        color: var(--ink-3);\r\n        margin-left: 8px;\r\n      }\r\n      .result-msg {\r\n        font-size: 15.5px;\r\n        color: var(--ink-2);\r\n        max-width: 46ch;\r\n        line-height: 1.5;\r\n      }\r\n      .hr-flag {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 9px;\r\n        background: color-mix(in srgb, var(--red) 10%, var(--panel));\r\n        color: var(--red);\r\n        font-weight: 600;\r\n        font-size: 14px;\r\n        padding: 11px 16px;\r\n        border-radius: 9px;\r\n      }\r\n      .result-actions {\r\n        display: flex;\r\n        gap: 12px;\r\n        margin-top: 8px;\r\n      }\r\n\r\n      /* ---------- password modal ---------- */\r\n      .modal-scrim {\r\n        position: fixed;\r\n        inset: 0;\r\n        background: rgba(44, 62, 80, 0.45);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        z-index: 80;\r\n        padding: 20px;\r\n        animation: pop 0.15s ease;\r\n      }\r\n      .modal {\r\n        background: var(--panel);\r\n        border-radius: 16px;\r\n        width: 420px;\r\n        max-width: 100%;\r\n        box-shadow: var(--shadow-lg);\r\n        overflow: hidden;\r\n      }\r\n      .modal-head {\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        padding: 20px 22px;\r\n        border-bottom: 1px solid var(--line);\r\n      }\r\n      .modal-head h3 {\r\n        font-size: 18px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .form {\r\n        padding: 22px;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 16px;\r\n      }\r\n      .form label {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 7px;\r\n        font-size: 13.5px;\r\n        font-weight: 600;\r\n        color: var(--ink-2);\r\n      }\r\n      .form input {\r\n        border: 1.5px solid var(--line);\r\n        border-radius: 9px;\r\n        padding: 11px 13px;\r\n        font-size: 15px;\r\n        font-family: inherit;\r\n        outline: none;\r\n      }\r\n      .form input:focus {\r\n        border-color: var(--blue);\r\n      }\r\n      .modal-foot {\r\n        display: flex;\r\n        justify-content: flex-end;\r\n        gap: 11px;\r\n        padding: 0 22px 22px;\r\n      }\r\n\r\n      /* ---------- toasts ---------- */\r\n      .toast-stack {\r\n        position: fixed;\r\n        bottom: 24px;\r\n        left: 50%;\r\n        transform: translateX(-50%);\r\n        z-index: 90;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 10px;\r\n        align-items: center;\r\n      }\r\n      .toast {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 11px;\r\n        background: var(--navy);\r\n        color: #fff;\r\n        padding: 13px 20px;\r\n        border-radius: 11px;\r\n        font-size: 14.5px;\r\n        font-weight: 600;\r\n        box-shadow: var(--shadow-lg);\r\n        animation: toastIn 0.25s ease;\r\n      }\r\n      .toast .svg,\r\n      .toast svg {\r\n        color: var(--green);\r\n      }\r\n      @keyframes toastIn {\r\n        from {\r\n          opacity: 0;\r\n          transform: translateY(12px);\r\n        }\r\n        to {\r\n          opacity: 1;\r\n          transform: none;\r\n        }\r\n      }\r\n\r\n      /* ---------- complete screen ---------- */\r\n      .complete-screen {\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        min-height: 100%;\r\n        padding: 20px;\r\n      }\r\n      .complete-card {\r\n        background: var(--panel);\r\n        border-radius: 20px;\r\n        box-shadow: var(--shadow-lg);\r\n        padding: 48px 44px;\r\n        max-width: 560px;\r\n        text-align: center;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        gap: 18px;\r\n      }\r\n      .complete-burst {\r\n        width: 104px;\r\n        height: 104px;\r\n        border-radius: 50%;\r\n        background: linear-gradient(135deg, var(--green), #1e9b54);\r\n        color: #fff;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        box-shadow: 0 12px 30px rgba(43, 189, 107, 0.4);\r\n      }\r\n      .complete-card h1 {\r\n        font-size: clamp(24px, 6vw, 32px);\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n        letter-spacing: -0.4px;\r\n      }\r\n      .complete-body {\r\n        font-size: 16px;\r\n        line-height: 1.6;\r\n        color: var(--ink-2);\r\n        max-width: 44ch;\r\n      }\r\n      .sync-badge {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        gap: 8px;\r\n        background: color-mix(in srgb, var(--green) 12%, var(--panel));\r\n        color: var(--green);\r\n        font-weight: 700;\r\n        font-size: 13.5px;\r\n        padding: 8px 15px;\r\n        border-radius: 20px;\r\n      }\r\n      .complete-actions {\r\n        display: flex;\r\n        gap: 13px;\r\n        margin-top: 6px;\r\n      }\r\n\r\n      /* ---------- certificate ---------- */\r\n      .cert-overlay {\r\n        position: fixed;\r\n        inset: 0;\r\n        background: #2c2823;\r\n        z-index: 100;\r\n        overflow: auto;\r\n        padding: 24px;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        gap: 20px;\r\n      }\r\n      .cert-toolbar {\r\n        display: flex;\r\n        gap: 12px;\r\n        width: 100%;\r\n        max-width: 820px;\r\n        justify-content: flex-end;\r\n      }\r\n      .cert-sheet {\r\n        background: var(--panel);\r\n        width: 100%;\r\n        max-width: 820px;\r\n        min-height: 560px;\r\n        border-radius: 6px;\r\n        box-shadow: var(--shadow-lg);\r\n        padding: 26px;\r\n      }\r\n      .cert-border {\r\n        min-height: 508px;\r\n        border: 2px solid var(--navy);\r\n        outline: 6px solid #fff;\r\n        box-shadow: inset 0 0 0 7px #eef1f3;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        justify-content: center;\r\n        text-align: center;\r\n        padding: 44px 10%;\r\n        gap: 18px;\r\n      }\r\n      .cert-brand {\r\n        font-family: \"Cormorant Garamond\", serif;\r\n        font-weight: 700;\r\n        font-size: 46px;\r\n        color: var(--ink);\r\n        letter-spacing: 1px;\r\n      }\r\n      .cert-h {\r\n        font-size: 15px;\r\n        font-weight: 700;\r\n        letter-spacing: 4px;\r\n        text-transform: uppercase;\r\n        color: var(--blue);\r\n      }\r\n      .cert-line {\r\n        font-size: 15px;\r\n        color: var(--ink-2);\r\n      }\r\n      .cert-name {\r\n        font-family: \"Cormorant Garamond\", serif;\r\n        font-weight: 700;\r\n        font-size: 40px;\r\n        color: var(--ink);\r\n        border-bottom: 2px solid var(--line);\r\n        padding: 0 40px 8px;\r\n        white-space: nowrap;\r\n        line-height: 1.1;\r\n      }\r\n      .cert-prog {\r\n        font-size: 21px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .cert-seal {\r\n        width: 62px;\r\n        height: 62px;\r\n        border-radius: 50%;\r\n        background: var(--green);\r\n        color: #fff;\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        box-shadow: 0 6px 16px rgba(43, 189, 107, 0.35);\r\n        margin: 4px 0;\r\n      }\r\n      .cert-foot {\r\n        display: flex;\r\n        gap: 90px;\r\n        margin-top: 14px;\r\n      }\r\n      .cert-foot-col {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 5px;\r\n      }\r\n      .cert-val {\r\n        font-size: 16px;\r\n        font-weight: 600;\r\n        color: var(--ink);\r\n        border-bottom: 1px solid var(--line);\r\n        padding-bottom: 5px;\r\n      }\r\n      .cert-sig {\r\n        font-family: \"Cormorant Garamond\", serif;\r\n        font-size: 24px;\r\n        font-weight: 600;\r\n        color: var(--ink);\r\n        border-bottom: 1px solid var(--line);\r\n        padding-bottom: 2px;\r\n      }\r\n      .cert-cap {\r\n        font-size: 11.5px;\r\n        letter-spacing: 1px;\r\n        text-transform: uppercase;\r\n        color: var(--ink-3);\r\n      }\r\n\r\n      @media print {\r\n        body * {\r\n          visibility: hidden;\r\n        }\r\n        .cert-overlay,\r\n        .cert-overlay * {\r\n          visibility: visible;\r\n        }\r\n        .cert-overlay {\r\n          position: absolute;\r\n          inset: 0;\r\n          background: var(--panel);\r\n          padding: 0;\r\n        }\r\n        .no-print {\r\n          display: none !important;\r\n        }\r\n        .cert-sheet {\r\n          box-shadow: none;\r\n          max-width: 100%;\r\n          width: 100%;\r\n        }\r\n      }\r\n\r\n      /* ---------- responsive ---------- */\r\n      @media (max-width: 1024px) {\r\n        .sidebar {\r\n          flex-basis: 260px;\r\n          padding: 24px 20px;\r\n        }\r\n      }\r\n      @media (max-width: 920px) {\r\n        .card-grid {\r\n          grid-template-columns: 1fr;\r\n          max-width: 560px;\r\n        }\r\n      }\r\n      /* tablet & below: layout stacks — sidebar becomes a compact strip above content */\r\n      @media (max-width: 860px) {\r\n        .app {\r\n          height: auto;\r\n          min-height: 100dvh;\r\n        }\r\n        .topnav {\r\n          position: sticky;\r\n          top: 0;\r\n        }\r\n        .app-body {\r\n          flex-direction: column;\r\n        }\r\n        .main {\r\n          overflow: visible;\r\n        }\r\n        .sidebar {\r\n          flex: none;\r\n          width: 100%;\r\n          flex-direction: row;\r\n          flex-wrap: wrap;\r\n          align-items: stretch;\r\n          gap: 12px;\r\n          padding: 16px;\r\n          border-right: none;\r\n          border-bottom: 1px solid var(--chrome-line);\r\n          overflow: visible;\r\n        }\r\n        .ring-block {\r\n          flex: 1 1 100%;\r\n          padding: 0;\r\n        }\r\n        .rp-pct {\r\n          font-size: 28px;\r\n        }\r\n        .rp-field {\r\n          height: 64px;\r\n        }\r\n        .rp-bun {\r\n          font-size: 24px;\r\n        }\r\n        .rp-goal {\r\n          font-size: 21px;\r\n        }\r\n        .rp-rabbit {\r\n          bottom: 24px;\r\n        }\r\n        .side-card,\r\n        .cert-block {\r\n          flex: 1 1 240px;\r\n          padding: 14px 16px;\r\n        }\r\n        .side-card-h {\r\n          margin-bottom: 9px;\r\n        }\r\n        /* lesson player: stepper rail moves above content as a scrollable row */\r\n        .stepper-body {\r\n          flex-direction: column-reverse;\r\n          gap: 14px;\r\n        }\r\n        .step-rail {\r\n          flex: none;\r\n          flex-direction: row;\r\n          overflow-x: auto;\r\n          padding: 8px;\r\n          gap: 4px;\r\n        }\r\n        .rail-item {\r\n          flex: 1 0 auto;\r\n          padding: 10px 12px;\r\n        }\r\n        .rail-line,\r\n        .rail-txt small {\r\n          display: none;\r\n        }\r\n        /* in the stacked layout flex:1 (basis 0) collapses the content; let it\r\n           take its natural height across the full width instead */\r\n        .stepper-content {\r\n          flex: none;\r\n          width: 100%;\r\n        }\r\n      }\r\n      /* phones */\r\n      @media (max-width: 640px) {\r\n        .topnav {\r\n          height: 58px;\r\n          flex-basis: 58px;\r\n          padding: 0 12px;\r\n        }\r\n        .brand-word {\r\n          font-size: 26px;\r\n        }\r\n        .brand-sub {\r\n          font-size: 9px;\r\n          letter-spacing: 1.5px;\r\n        }\r\n        .nav-right {\r\n          gap: 4px;\r\n        }\r\n        .user-name {\r\n          display: none;\r\n        }\r\n        .nav-user {\r\n          padding: 4px;\r\n        }\r\n        .lang-pill {\r\n          padding: 8px 11px;\r\n          margin-left: 0;\r\n        }\r\n        .lang-pill .lang-label {\r\n          display: none;\r\n        }\r\n        .lang-pill .lang-label-sm {\r\n          display: inline;\r\n        }\r\n        .dropdown {\r\n          position: fixed;\r\n          top: 62px;\r\n          left: 12px;\r\n          right: 12px;\r\n          width: auto;\r\n          min-width: 0;\r\n        }\r\n        .player-head {\r\n          gap: 10px;\r\n          margin-bottom: 16px;\r\n        }\r\n        .step-row {\r\n          gap: 8px;\r\n          margin-bottom: 16px;\r\n        }\r\n        .step-chip {\r\n          padding: 10px 12px;\r\n          min-width: calc(50% - 4px);\r\n        }\r\n        .slide-nav,\r\n        .pdf-nav {\r\n          flex-wrap: wrap;\r\n          gap: 10px;\r\n          padding: 12px 14px;\r\n        }\r\n        .video-meta {\r\n          flex-direction: column;\r\n          align-items: stretch;\r\n          gap: 12px;\r\n        }\r\n        .video-meta .btn {\r\n          justify-content: center;\r\n        }\r\n        .quiz-top {\r\n          flex-wrap: wrap;\r\n          row-gap: 8px;\r\n        }\r\n        .opt {\r\n          padding: 13px 14px;\r\n          font-size: 15px;\r\n        }\r\n        .result-actions,\r\n        .quiz-foot {\r\n          flex-wrap: wrap;\r\n        }\r\n        .focus-name {\r\n          display: none;\r\n        }\r\n        .complete-card {\r\n          padding: 34px 22px;\r\n        }\r\n        .complete-actions {\r\n          flex-direction: column;\r\n          width: 100%;\r\n        }\r\n        .complete-actions .btn {\r\n          justify-content: center;\r\n        }\r\n        .toast-stack {\r\n          left: 12px;\r\n          right: 12px;\r\n          transform: none;\r\n          align-items: stretch;\r\n        }\r\n        .toast {\r\n          justify-content: center;\r\n        }\r\n        /* certificate scales down to the phone width */\r\n        .cert-overlay {\r\n          padding: 14px;\r\n        }\r\n        .cert-sheet {\r\n          padding: 14px;\r\n          min-height: 0;\r\n        }\r\n        .cert-border {\r\n          min-height: 0;\r\n          padding: 32px 14px;\r\n          gap: 14px;\r\n        }\r\n        .cert-brand {\r\n          font-size: 34px;\r\n        }\r\n        .cert-name {\r\n          font-size: clamp(26px, 9vw, 40px);\r\n          white-space: normal;\r\n          padding: 0 10px 8px;\r\n        }\r\n        .cert-foot {\r\n          gap: 26px;\r\n          flex-wrap: wrap;\r\n          justify-content: center;\r\n        }\r\n      }\r\n      /* CJK slight size bump */\r\n      .lang-zh .quiz-q {\r\n        letter-spacing: 0.3px;\r\n      }\r\n      /* ===== Learner themes (set on .app via data-theme) =====\r\n   Default (\"light\") is the airy white storefront look defined in :root.\r\n   The progression/correct green (--green) is shared across every theme. */\r\n      .app[data-theme=\"dark\"],\r\n      .app[data-theme=\"midnight\"],\r\n      .app[data-theme=\"maroon\"],\r\n      .app[data-theme=\"lavender\"],\r\n      .app[data-theme=\"green\"] {\r\n        /* dark/colored chrome -> light chrome text */\r\n        --chrome-ink: #ffffff;\r\n        --chrome-ink-2: rgba(255, 255, 255, 0.72);\r\n        --chrome-ink-3: rgba(255, 255, 255, 0.46);\r\n        --chrome-hover: rgba(255, 255, 255, 0.1);\r\n        --chrome-line: rgba(255, 255, 255, 0.14);\r\n        --chrome-card: rgba(255, 255, 255, 0.06);\r\n      }\r\n      .app[data-theme=\"dark\"] {\r\n        /* Noir — warm near-black editorial */\r\n        --bg: #171411;\r\n        --panel: #221e19;\r\n        --navy: #000000;\r\n        --navy-2: #1b1712;\r\n        --navy-3: #2c2720;\r\n        --chrome-bg: #000000;\r\n        --ink: #f1ece3;\r\n        --ink-2: #b7ad9d;\r\n        --ink-3: #857c6c;\r\n        --line: #322c23;\r\n        --thumb: #3a342a;\r\n        --thumb-2: #2f2920;\r\n        --blue: #9a7740;\r\n        --blue-d: #866434;\r\n        --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 18px rgba(0, 0, 0, 0.4);\r\n        --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.55);\r\n      }\r\n      .app[data-theme=\"midnight\"] {\r\n        /* Stone — light greige body, charcoal chrome */\r\n        --bg: #ecebe6;\r\n        --panel: #ffffff;\r\n        --navy: #35332d;\r\n        --navy-2: #403d36;\r\n        --navy-3: #4d4940;\r\n        --chrome-bg: #35332d;\r\n        --ink: #2b2a26;\r\n        --ink-2: #67645c;\r\n        --ink-3: #9d9a90;\r\n        --line: #e3e1d8;\r\n        --thumb: #dad8cd;\r\n        --thumb-2: #c8c5ba;\r\n        --blue: #3f3d37;\r\n        --blue-d: #2c2b27;\r\n      }\r\n      .app[data-theme=\"maroon\"] {\r\n        /* Rosewood — blush body, wine chrome */\r\n        --bg: #f5ece9;\r\n        --panel: #ffffff;\r\n        --navy: #48282c;\r\n        --navy-2: #552f34;\r\n        --navy-3: #693c41;\r\n        --chrome-bg: #48282c;\r\n        --ink: #3a2528;\r\n        --ink-2: #6f5256;\r\n        --ink-3: #a3868a;\r\n        --line: #ecdcda;\r\n        --thumb: #e3d0cf;\r\n        --thumb-2: #d1bab9;\r\n        --blue: #8a464d;\r\n        --blue-d: #723a40;\r\n      }\r\n      .app[data-theme=\"lavender\"] {\r\n        /* Camel — sand body, espresso chrome */\r\n        --bg: #f4ecdf;\r\n        --panel: #ffffff;\r\n        --navy: #4a3a29;\r\n        --navy-2: #574631;\r\n        --navy-3: #6b573f;\r\n        --chrome-bg: #4a3a29;\r\n        --ink: #382c1d;\r\n        --ink-2: #6e5f4b;\r\n        --ink-3: #a3947d;\r\n        --line: #ece1cf;\r\n        --thumb: #e6d8c3;\r\n        --thumb-2: #d2c2a8;\r\n        --blue: #9c7038;\r\n        --blue-d: #84602e;\r\n      }\r\n      .app[data-theme=\"green\"] {\r\n        /* Olive — pale olive body, deep-olive chrome */\r\n        --bg: #eef0e4;\r\n        --panel: #ffffff;\r\n        --navy: #383d24;\r\n        --navy-2: #434829;\r\n        --navy-3: #535839;\r\n        --chrome-bg: #383d24;\r\n        --ink: #2c2f1f;\r\n        --ink-2: #62654e;\r\n        --ink-3: #9a9c84;\r\n        --line: #e4e6d6;\r\n        --thumb: #d9dcc8;\r\n        --thumb-2: #c6cab2;\r\n        --blue: #5f6a34;\r\n        --blue-d: #4d5629;\r\n      }\r\n      /* certificate always renders on a light sheet regardless of theme */\r\n      .cert-sheet {\r\n        --navy: #1c1a17;\r\n        --ink: #211e1a;\r\n        --ink-2: #5f5a52;\r\n        --ink-3: #9c948a;\r\n        --line: #e8e3da;\r\n        --panel: #fff;\r\n        --green: #2bbd6b;\r\n        --blue: #1c1a17;\r\n      }\r\n      .form input {\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n      }\r\n\r\n      /* theme picker (profile dropdown) */\r\n      .theme-grid {\r\n        display: grid;\r\n        grid-template-columns: repeat(3, 1fr);\r\n        gap: 8px;\r\n        padding: 6px 12px 12px;\r\n      }\r\n      .theme-sw {\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        gap: 6px;\r\n        padding: 8px 4px;\r\n        border-radius: 9px;\r\n        transition: 0.13s;\r\n        color: var(--ink-2);\r\n        font-size: 11.5px;\r\n        font-weight: 600;\r\n      }\r\n      .theme-sw:hover {\r\n        background: var(--line);\r\n      }\r\n      .theme-sw.active {\r\n        background: var(--line);\r\n        color: var(--ink);\r\n        box-shadow: inset 0 0 0 2px var(--blue);\r\n      }\r\n      .theme-chip {\r\n        width: 34px;\r\n        height: 34px;\r\n        border-radius: 9px;\r\n        border: 1.5px solid rgba(0, 0, 0, 0.12);\r\n        position: relative;\r\n        overflow: hidden;\r\n      }\r\n      .theme-chip i {\r\n        position: absolute;\r\n        bottom: 4px;\r\n        right: 4px;\r\n        width: 11px;\r\n        height: 11px;\r\n        border-radius: 50%;\r\n      }\r\n      .tc-bg {\r\n        position: absolute;\r\n        left: 0;\r\n        right: 0;\r\n        bottom: 0;\r\n        height: 46%;\r\n      }\r\n      .dd-section-label {\r\n        font-size: 11px;\r\n        font-weight: 700;\r\n        text-transform: uppercase;\r\n        letter-spacing: 0.6px;\r\n        color: var(--ink-3);\r\n        padding: 8px 14px 2px;\r\n      }\r\n\r\n      /* ===== Hopping-rabbit progress ===== */\r\n      .rabbit-prog {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 10px;\r\n      }\r\n      .rp-top {\r\n        display: flex;\r\n        align-items: baseline;\r\n        gap: 8px;\r\n      }\r\n      .rp-pct {\r\n        font-size: 36px;\r\n        font-weight: 800;\r\n        color: var(--chrome-ink);\r\n        line-height: 1;\r\n      }\r\n      .rp-cap {\r\n        font-size: 13px;\r\n        font-weight: 600;\r\n        color: var(--chrome-ink-2);\r\n      }\r\n      .rp-field {\r\n        position: relative;\r\n        height: 94px;\r\n        margin-top: 4px;\r\n      }\r\n      .rp-ground {\r\n        position: absolute;\r\n        left: 8px;\r\n        right: 8px;\r\n        bottom: 20px;\r\n        border-bottom: 3px dotted var(--chrome-line);\r\n      }\r\n      .rp-stone {\r\n        position: absolute;\r\n        bottom: 8px;\r\n        transform: translateX(-50%);\r\n        width: 26px;\r\n        height: 26px;\r\n        border-radius: 50%;\r\n        background: var(--chrome-hover);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n        font-size: 11px;\r\n        font-weight: 700;\r\n        color: var(--chrome-ink-2);\r\n        transition:\r\n          background 0.3s,\r\n          color 0.3s,\r\n          box-shadow 0.3s;\r\n        z-index: 1;\r\n        box-shadow: inset 0 0 0 1px var(--chrome-line);\r\n      }\r\n      .rp-stone.done {\r\n        background: var(--green);\r\n        color: #fff;\r\n        box-shadow: 0 4px 12px rgba(43, 189, 107, 0.4);\r\n      }\r\n      .rp-goal {\r\n        position: absolute;\r\n        right: -4px;\r\n        bottom: 6px;\r\n        font-size: 26px;\r\n        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));\r\n      }\r\n      .rp-rabbit {\r\n        position: absolute;\r\n        bottom: 28px;\r\n        transform: translateX(-50%);\r\n        z-index: 2;\r\n        transition: left 0.75s cubic-bezier(0.45, -0.35, 0.5, 1.4);\r\n      }\r\n      .rp-bun {\r\n        display: block;\r\n        font-size: 30px;\r\n        transform-origin: bottom center;\r\n        transform: rotate(-3deg);\r\n      }\r\n\r\n      /* ===== test card / lockout ===== */\r\n      .lock-badge.danger {\r\n        background: var(--red);\r\n        color: #fff;\r\n      }\r\n\r\n      /* static rail items (used by the test stepper) aren't clickable */\r\n      .rail-item.static {\r\n        cursor: default;\r\n      }\r\n      .rail-item.static:hover {\r\n        background: transparent;\r\n      }\r\n\r\n      /* ===== exam timer & footer ===== */\r\n      .quiz-timer {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        gap: 6px;\r\n        font-size: 14px;\r\n        font-weight: 800;\r\n        font-variant-numeric: tabular-nums;\r\n        color: var(--ink);\r\n        background: var(--line);\r\n        padding: 6px 11px;\r\n        border-radius: 8px;\r\n        white-space: nowrap;\r\n      }\r\n      .quiz-timer.low {\r\n        background: color-mix(in srgb, var(--red) 14%, var(--panel));\r\n        color: var(--red);\r\n        animation: pulse 1s ease-in-out infinite;\r\n      }\r\n      @keyframes pulse {\r\n        50% {\r\n          opacity: 0.55;\r\n        }\r\n      }\r\n      .exam-foot {\r\n        justify-content: space-between;\r\n      }\r\n      .exam-foot .btn {\r\n        margin-left: 0;\r\n      }\r\n      .exam-count {\r\n        font-size: 13.5px;\r\n        font-weight: 700;\r\n        color: var(--ink-2);\r\n        font-variant-numeric: tabular-nums;\r\n      }\r\n      .exam-hint {\r\n        margin-top: 12px;\r\n        font-size: 12.5px;\r\n        color: var(--ink-3);\r\n        text-align: center;\r\n      }\r\n\r\n      /* ===== test intro ===== */\r\n      .test-intro {\r\n        padding: clamp(26px, 5vw, 44px) clamp(18px, 4vw, 36px);\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        text-align: center;\r\n        gap: 14px;\r\n      }\r\n      .ti-icon {\r\n        width: 84px;\r\n        height: 84px;\r\n        border-radius: 50%;\r\n        background: color-mix(in srgb, var(--blue) 10%, var(--panel));\r\n        color: var(--blue);\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n      }\r\n      .test-intro h2 {\r\n        font-size: 24px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .ti-body {\r\n        font-size: 15.5px;\r\n        line-height: 1.6;\r\n        color: var(--ink-2);\r\n        max-width: 52ch;\r\n      }\r\n      .ti-facts {\r\n        display: grid;\r\n        grid-template-columns: repeat(2, minmax(0, 1fr));\r\n        gap: 10px;\r\n        width: 100%;\r\n        max-width: 460px;\r\n        margin: 8px 0 6px;\r\n      }\r\n      .ti-fact {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 9px;\r\n        padding: 12px 14px;\r\n        border-radius: 10px;\r\n        background: var(--bg);\r\n        box-shadow: inset 0 0 0 1px var(--line);\r\n        font-size: 14px;\r\n        font-weight: 600;\r\n        color: var(--ink);\r\n        text-align: left;\r\n      }\r\n      .ti-fact svg {\r\n        color: var(--blue);\r\n        flex: 0 0 auto;\r\n      }\r\n\r\n      /* ===== feedback survey ===== */\r\n      .survey-screen {\r\n        display: flex;\r\n        justify-content: center;\r\n        padding: 10px;\r\n      }\r\n      .survey-card {\r\n        background: var(--panel);\r\n        border-radius: 18px;\r\n        box-shadow: var(--shadow-lg);\r\n        padding: clamp(26px, 5vw, 40px);\r\n        max-width: 620px;\r\n        width: 100%;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        gap: 16px;\r\n        text-align: center;\r\n      }\r\n      .survey-card h1 {\r\n        font-size: clamp(22px, 5vw, 28px);\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .srv-q {\r\n        width: 100%;\r\n        text-align: left;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 10px;\r\n        padding-top: 6px;\r\n      }\r\n      .srv-label {\r\n        font-size: 15px;\r\n        font-weight: 700;\r\n        color: var(--ink);\r\n      }\r\n      .srv-scale {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 12px;\r\n      }\r\n      .srv-end {\r\n        font-size: 12px;\r\n        color: var(--ink-3);\r\n        white-space: nowrap;\r\n      }\r\n      .srv-dots {\r\n        display: flex;\r\n        gap: 8px;\r\n        flex: 1;\r\n        justify-content: center;\r\n      }\r\n      .srv-dot {\r\n        width: 42px;\r\n        height: 42px;\r\n        border-radius: 10px;\r\n        background: var(--bg);\r\n        box-shadow: inset 0 0 0 1.5px var(--line);\r\n        font-size: 15px;\r\n        font-weight: 700;\r\n        color: var(--ink-2);\r\n        transition: 0.13s;\r\n      }\r\n      .srv-dot:hover {\r\n        box-shadow: inset 0 0 0 1.5px var(--ink-3);\r\n      }\r\n      .srv-dot.on {\r\n        background: var(--blue);\r\n        color: #fff;\r\n        box-shadow: inset 0 0 0 1.5px var(--blue);\r\n      }\r\n      .srv-text {\r\n        width: 100%;\r\n        border: 1.5px solid var(--line);\r\n        border-radius: 10px;\r\n        padding: 12px 14px;\r\n        font-size: 15px;\r\n        font-family: inherit;\r\n        resize: vertical;\r\n        outline: none;\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n      }\r\n      .srv-text:focus {\r\n        border-color: var(--blue);\r\n      }\r\n      .srv-err {\r\n        align-self: stretch;\r\n        color: var(--red);\r\n        font-size: 13.5px;\r\n        font-weight: 600;\r\n        background: color-mix(in srgb, var(--red) 10%, var(--panel));\r\n        padding: 10px 14px;\r\n        border-radius: 9px;\r\n      }\r\n      .cert-gate-note {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        gap: 8px;\r\n        font-size: 13px;\r\n        font-weight: 600;\r\n        color: var(--ink-3);\r\n      }\r\n      .cert-gate-note svg {\r\n        color: var(--red);\r\n      }\r\n\r\n      /* ===== admin console ===== */\r\n      .admin-console {\r\n        max-width: 980px;\r\n        margin: 0 auto;\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 22px;\r\n      }\r\n      .adm-section {\r\n        background: var(--panel);\r\n        border-radius: var(--radius);\r\n        box-shadow: var(--shadow);\r\n        padding: 22px;\r\n      }\r\n      .adm-h {\r\n        font-size: 18px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n        margin-bottom: 6px;\r\n      }\r\n      .adm-hint {\r\n        font-size: 13.5px;\r\n        color: var(--ink-3);\r\n        margin-bottom: 14px;\r\n        line-height: 1.5;\r\n      }\r\n      .adm-unit {\r\n        border: 1px solid var(--line);\r\n        border-radius: 11px;\r\n        padding: 14px 16px;\r\n        margin-bottom: 14px;\r\n      }\r\n      .adm-unit-h {\r\n        font-size: 14.5px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n        margin-bottom: 10px;\r\n      }\r\n      .adm-file {\r\n        display: flex;\r\n        align-items: center;\r\n        justify-content: space-between;\r\n        gap: 12px;\r\n        padding: 9px 0;\r\n        border-top: 1px solid var(--line);\r\n        flex-wrap: wrap;\r\n      }\r\n      .adm-file-main {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 10px;\r\n      }\r\n      .adm-file-name {\r\n        font-size: 14px;\r\n        font-weight: 600;\r\n        color: var(--ink);\r\n      }\r\n      .adm-file-tag {\r\n        font-size: 11px;\r\n        font-weight: 700;\r\n        text-transform: uppercase;\r\n        letter-spacing: 0.4px;\r\n        color: var(--ink-3);\r\n        background: var(--bg);\r\n        padding: 3px 8px;\r\n        border-radius: 20px;\r\n      }\r\n      .adm-file-tag.custom {\r\n        color: var(--green);\r\n        background: color-mix(in srgb, var(--green) 12%, var(--panel));\r\n      }\r\n      .adm-file-actions {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 8px;\r\n        flex-wrap: wrap;\r\n      }\r\n      .adm-input {\r\n        border: 1.5px solid var(--line);\r\n        border-radius: 8px;\r\n        padding: 8px 11px;\r\n        font-size: 13.5px;\r\n        font-family: inherit;\r\n        outline: none;\r\n        width: 220px;\r\n        max-width: 52vw;\r\n        background: var(--panel);\r\n        color: var(--ink);\r\n      }\r\n      .adm-input:focus {\r\n        border-color: var(--blue);\r\n      }\r\n      .adm-table {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 8px;\r\n      }\r\n      .adm-trow {\r\n        display: flex;\r\n        align-items: center;\r\n        gap: 12px;\r\n        padding: 12px 14px;\r\n        border-radius: 10px;\r\n        background: var(--bg);\r\n        flex-wrap: wrap;\r\n      }\r\n      .adm-tcell {\r\n        font-size: 13.5px;\r\n        color: var(--ink-2);\r\n        font-weight: 600;\r\n      }\r\n      .adm-tcell.name {\r\n        flex: 1;\r\n        min-width: 120px;\r\n        font-weight: 800;\r\n        color: var(--ink);\r\n      }\r\n      .adm-tcell.status {\r\n        padding: 3px 10px;\r\n        border-radius: 20px;\r\n        background: var(--line);\r\n      }\r\n      .adm-tcell.status.ok {\r\n        color: var(--green);\r\n        background: color-mix(in srgb, var(--green) 12%, var(--panel));\r\n      }\r\n      .adm-tcell.status.locked {\r\n        color: var(--red);\r\n        background: color-mix(in srgb, var(--red) 12%, var(--panel));\r\n      }\r\n      .adm-survey {\r\n        display: flex;\r\n        flex-direction: column;\r\n        gap: 8px;\r\n      }\r\n      .adm-srow {\r\n        display: flex;\r\n        justify-content: space-between;\r\n        gap: 14px;\r\n        font-size: 14px;\r\n        color: var(--ink-2);\r\n        padding: 8px 0;\r\n        border-bottom: 1px solid var(--line);\r\n      }\r\n      .adm-srow b {\r\n        color: var(--ink);\r\n      }\r\n      .adm-comment {\r\n        margin-top: 8px;\r\n        font-style: italic;\r\n        color: var(--ink-2);\r\n        line-height: 1.5;\r\n      }\r\n\r\n      /* ===== screenshot guard ===== */\r\n      .protect {\r\n        -webkit-user-select: none;\r\n        user-select: none;\r\n      }\r\n      .screen-shield {\r\n        position: fixed;\r\n        inset: 0;\r\n        z-index: 2147483000;\r\n        background: var(--navy);\r\n        color: #fff;\r\n        display: flex;\r\n        flex-direction: column;\r\n        align-items: center;\r\n        justify-content: center;\r\n        gap: 12px;\r\n        text-align: center;\r\n        padding: 24px;\r\n      }\r\n      .screen-shield svg {\r\n        color: rgba(255, 255, 255, 0.7);\r\n      }\r\n      .ss-title {\r\n        font-size: 20px;\r\n        font-weight: 800;\r\n      }\r\n      .ss-sub {\r\n        font-size: 14px;\r\n        color: rgba(255, 255, 255, 0.7);\r\n      }\r\n      .ss-flash {\r\n        position: fixed;\r\n        inset: 0;\r\n        z-index: 2147483000;\r\n        background: #000;\r\n        animation: ssflash 0.7s ease;\r\n        pointer-events: none;\r\n      }\r\n      @keyframes ssflash {\r\n        from {\r\n          opacity: 1;\r\n        }\r\n        to {\r\n          opacity: 0;\r\n        }\r\n      }\r\n\r\n      @media (max-width: 640px) {\r\n        .ti-facts {\r\n          grid-template-columns: 1fr;\r\n        }\r\n        .srv-dot {\r\n          width: 38px;\r\n          height: 38px;\r\n        }\r\n        .adm-input {\r\n          width: 100%;\r\n          max-width: 100%;\r\n        }\r\n      }"

// ===== i18n.jsx =====
// i18n.jsx — UI string dictionary for iORA LMS (English / 中文 / Bahasa Melayu)
// Exposes LANGS and UI (a nested dict keyed by lang code).

const LANGS = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh", label: "中文", short: "中" },
  { code: "ms", label: "Bahasa Melayu", short: "MS" },
];

// Helper: t3(en, zh, ms) -> {en, zh, ms}
const t3 = (en, zh, ms) => ({ en, zh, ms });

const UI = {
  // sidebar / progress
  brandSub: t3("Learning Hub", "学习中心", "Hab Pembelajaran"),
  completed: t3("Completed", "已完成", "Selesai"),
  journeyComplete: t3("Journey complete", "旅程完成", "Perjalanan selesai"),
  upcoming: t3("Upcoming", "即将到来", "Akan Datang"),
  nothingUpcoming: t3(
    "Nothing upcoming — nice work!",
    "暂无待办事项，做得好！",
    "Tiada tugasan — syabas!",
  ),
  dueOn: t3("Due", "截止", "Tarikh akhir"),
  downloadCert: t3(
    "Download E-Certificate",
    "下载电子证书",
    "Muat Turun E-Sijil",
  ),
  certReady: t3(
    "Your certificate is ready",
    "您的证书已就绪",
    "Sijil anda telah sedia",
  ),

  // dashboard / lesson cards
  myCourses: t3(
    "My Onboarding Journey",
    "我的入职旅程",
    "Perjalanan Onboarding Saya",
  ),
  week: t3("Week", "第", "Minggu"),
  weekSuffix: t3("", "周", ""),
  lesson: t3("Lesson", "课程", "Pelajaran"),
  finalTest: t3("Final Test", "期末测验", "Ujian Akhir"),
  locked: t3("Locked", "已锁定", "Dikunci"),

  // lesson parts
  slides: t3("Slides", "幻灯片", "Slaid"),
  reading: t3("Reading (PDF)", "阅读材料 (PDF)", "Bacaan (PDF)"),
  video: t3("Video", "视频", "Video"),
  quiz: t3("Quiz", "测验", "Kuiz"),
  of: t3("of", "/", "drpd"),
  finishWatching: t3(
    "I have finished watching",
    "我已看完",
    "Saya telah selesai menonton",
  ),
  watchToContinue: t3(
    "Watch the video to continue",
    "观看视频以继续",
    "Tonton video untuk meneruskan",
  ),
  markRead: t3("Mark as read", "标记为已读", "Tanda telah dibaca"),
  slidesDeck: t3("Course Slides.pptx", "课程幻灯片.pptx", "Slaid Kursus.pptx"),
  backToDash: t3("Back to dashboard", "返回主页", "Kembali ke papan pemuka"),
  continueTo: t3("Continue", "继续", "Teruskan"),
  partDone: t3("Done", "完成", "Selesai"),

  // quiz / test
  question: t3("Question", "问题", "Soalan"),
  submitAnswer: t3("Submit", "提交", "Hantar"),
  nextQuestion: t3("Next question", "下一题", "Soalan seterusnya"),
  seeResults: t3("See results", "查看结果", "Lihat keputusan"),
  passMark: t3("Pass mark", "及格分", "Markah lulus"),
  yourScore: t3("Your score", "您的得分", "Markah anda"),
  passed: t3("Passed", "通过", "Lulus"),
  failed: t3("Not passed", "未通过", "Tidak lulus"),
  passedMsg: t3(
    "Great job! The next step in your journey is now unlocked.",
    "太棒了！您旅程的下一步已解锁。",
    "Syabas! Langkah seterusnya dalam perjalanan anda kini dibuka.",
  ),
  failedMsg: t3(
    "You need 30 out of 40 to pass. Review the material and try again.",
    "您需要答对 40 题中的 30 题才能通过。请复习后重试。",
    "Anda perlukan 30 daripada 40 untuk lulus. Semak semula dan cuba lagi.",
  ),
  attempts: t3("Attempts", "尝试次数", "Percubaan"),
  hrFlagged: t3(
    "HR has been notified to follow up with you.",
    "HR 已收到通知将跟进。",
    "HR telah dimaklumkan untuk membantu anda.",
  ),
  tryAgain: t3("Try again", "重试", "Cuba lagi"),
  correct: t3("Correct", "正确", "Betul"),
  incorrect: t3("Incorrect", "错误", "Salah"),
  finishLesson: t3("Finish lesson", "完成课程", "Selesaikan pelajaran"),

  // top nav menus
  notifications: t3("Notifications", "通知", "Pemberitahuan"),
  markAllRead: t3("Mark all as read", "全部标为已读", "Tanda semua dibaca"),
  noNotifs: t3(
    "You are all caught up.",
    "没有新通知。",
    "Tiada pemberitahuan baharu.",
  ),

  // profile menu
  myProfile: t3("My Profile", "我的资料", "Profil Saya"),
  changePassword: t3("Change Password", "修改密码", "Tukar Kata Laluan"),
  theme: t3("Theme", "主题", "Tema"),
  themeLight: t3("Ivory", "象牙白", "Gading"),
  themeDark: t3("Noir", "玄黑", "Noir"),
  themeMidnight: t3("Stone", "石灰", "Batu"),
  themeMaroon: t3("Rosewood", "玫紫", "Rosewood"),
  themeLavender: t3("Camel", "驼色", "Unta"),
  themeGreen: t3("Olive", "橄榄", "Zaitun"),
  logOut: t3("Log Out", "退出登录", "Log Keluar"),
  role: t3(
    "Retail Associate · Onboarding",
    "零售员 · 入职中",
    "Penjual Runcit · Onboarding",
  ),
  currentPw: t3("Current password", "当前密码", "Kata laluan semasa"),
  newPw: t3("New password", "新密码", "Kata laluan baharu"),
  confirmPw: t3(
    "Confirm new password",
    "确认新密码",
    "Sahkan kata laluan baharu",
  ),
  save: t3("Save", "保存", "Simpan"),
  cancel: t3("Cancel", "取消", "Batal"),
  pwUpdated: t3("Password updated", "密码已更新", "Kata laluan dikemas kini"),

  // test complete
  congrats: t3("Congratulations!", "恭喜您！", "Tahniah!"),
  congratsBody: t3(
    "You have completed your entire onboarding journey. Your results have been sent to HR to confirm your permanent status.",
    "您已完成全部入职旅程。您的成绩已发送给人力资源部以确认您的转正状态。",
    "Anda telah menyelesaikan perjalanan onboarding anda. Keputusan anda telah dihantar kepada HR untuk pengesahan jawatan tetap.",
  ),
  syncedToHr: t3("Synced to HR", "已同步至 HR", "Disegerak ke HR"),
  backHome: t3("Back to dashboard", "返回主页", "Kembali ke papan pemuka"),

  // certificate
  certTitle: t3(
    "Certificate of Completion",
    "结业证书",
    "Sijil Tamat Pengajian",
  ),
  certPresented: t3(
    "This is to certify that",
    "兹证明",
    "Ini mengesahkan bahawa",
  ),
  certHasDone: t3(
    "has successfully completed the",
    "已成功完成",
    "telah berjaya menyelesaikan",
  ),
  certProgram: t3(
    "New Staff Onboarding Programme",
    "新员工入职培训计划",
    "Program Onboarding Staf Baharu",
  ),
  certDate: t3("Date of completion", "完成日期", "Tarikh tamat"),
  certSign: t3(
    "Training & Development",
    "培训与发展部",
    "Latihan & Pembangunan",
  ),
  print: t3(
    "Print / Save as PDF",
    "打印 / 另存为 PDF",
    "Cetak / Simpan sebagai PDF",
  ),

  // ---- tests / timer / attempts ----
  test: t3("Test", "测验", "Ujian"),
  testInstructions: t3(
    "Test instructions",
    "测验须知",
    "Arahan ujian",
  ),
  testIntro: t3(
    "You have 30 minutes to answer 40 questions. You need 30 correct to pass. The timer starts as soon as you begin and the test submits automatically when it runs out.",
    "您有 30 分钟回答 40 道题，需答对 30 题方可通过。计时从开始时启动，时间到将自动提交。",
    "Anda mempunyai 30 minit untuk menjawab 40 soalan. Anda perlukan 30 betul untuk lulus. Pemasa bermula sebaik anda mula dan ujian dihantar secara automatik apabila tamat masa.",
  ),
  beginTest: t3("Begin test", "开始测验", "Mula ujian"),
  timeRemaining: t3("Time remaining", "剩余时间", "Masa berbaki"),
  timeUp: t3("Time's up", "时间到", "Masa tamat"),
  timeUpMsg: t3(
    "Your time ran out and the test was submitted automatically.",
    "时间已到，测验已自动提交。",
    "Masa anda telah tamat dan ujian dihantar secara automatik.",
  ),
  attemptsLeft: t3(
    "Attempts remaining",
    "剩余尝试次数",
    "Percubaan berbaki",
  ),
  attemptOf: t3("Attempt", "第", "Percubaan"),
  questionsPicked: t3(
    "40 of 60 questions, randomly selected",
    "从 60 题中随机抽取 40 题",
    "40 daripada 60 soalan, dipilih secara rawak",
  ),
  prevQuestion: t3("Previous", "上一题", "Sebelumnya"),
  submitTest: t3("Submit test", "提交测验", "Hantar ujian"),
  unanswered: t3("unanswered", "未作答", "tidak dijawab"),
  answered: t3("answered", "已作答", "dijawab"),
  reviewBeforeSubmit: t3(
    "You can go back and change answers before submitting.",
    "提交前您可以返回修改答案。",
    "Anda boleh kembali dan menukar jawapan sebelum menghantar.",
  ),

  // ---- lockout ----
  lockedOut: t3("Test locked", "测验已锁定", "Ujian dikunci"),
  lockedOutMsg: t3(
    "You have used all 3 attempts. This test is now locked. Please contact HR, who can reset your access.",
    "您已用完全部 3 次尝试。此测验现已锁定。请联系人力资源部以重置您的访问权限。",
    "Anda telah menggunakan kesemua 3 percubaan. Ujian ini kini dikunci. Sila hubungi HR untuk menetapkan semula akses anda.",
  ),
  alreadyPassed: t3("Already passed", "已通过", "Sudah lulus"),
  alreadyPassedMsg: t3(
    "You have already passed this test.",
    "您已通过此测验。",
    "Anda telah lulus ujian ini.",
  ),

  // ---- survey ----
  surveyTitle: t3("Feedback Survey", "反馈问卷", "Tinjauan Maklum Balas"),
  surveyIntro: t3(
    "Before you download your certificate, please tell us about your onboarding experience. This is required.",
    "在下载证书之前，请告诉我们您的入职体验。此项为必填。",
    "Sebelum memuat turun sijil anda, sila beritahu kami tentang pengalaman onboarding anda. Ini diperlukan.",
  ),
  surveyClarity: t3(
    "How clear was the training content?",
    "培训内容是否清晰？",
    "Sejauh mana kandungan latihan jelas?",
  ),
  surveyPace: t3(
    "How was the pace of the programme?",
    "课程节奏如何？",
    "Bagaimana rentak program?",
  ),
  surveyUseful: t3(
    "How useful was the training for your role?",
    "培训对您的工作有多大帮助？",
    "Sejauh mana latihan berguna untuk peranan anda?",
  ),
  surveyComment: t3(
    "Any additional comments? (optional)",
    "还有其他意见吗？（选填）",
    "Sebarang komen tambahan? (pilihan)",
  ),
  surveyCommentPlaceholder: t3(
    "Tell us what went well or what could be better…",
    "告诉我们哪些做得好或可以改进…",
    "Beritahu kami apa yang baik atau boleh diperbaiki…",
  ),
  surveySubmit: t3("Submit & continue", "提交并继续", "Hantar & teruskan"),
  surveyRequired: t3(
    "Please rate all three questions before continuing.",
    "请先为全部三个问题评分后再继续。",
    "Sila nilai ketiga-tiga soalan sebelum meneruskan.",
  ),
  surveyThanks: t3(
    "Thank you for your feedback!",
    "感谢您的反馈！",
    "Terima kasih atas maklum balas anda!",
  ),
  rateLow: t3("Poor", "差", "Lemah"),
  rateHigh: t3("Excellent", "优秀", "Cemerlang"),
  certNeedsSurvey: t3(
    "Complete the feedback survey to unlock your certificate.",
    "完成反馈问卷以解锁您的证书。",
    "Lengkapkan tinjauan maklum balas untuk membuka sijil anda.",
  ),
  takeSurvey: t3("Take the survey", "填写问卷", "Isi tinjauan"),

  // ---- admin ----
  adminConsole: t3("Admin Console", "管理控制台", "Konsol Admin"),
  adminFiles: t3("Course files", "课程文件", "Fail kursus"),
  adminFilesHint: t3(
    "Replace the materials learners see. Uploads are stored in this browser only (front-end demo).",
    "替换学员所见的资料。上传仅保存在此浏览器中（前端演示）。",
    "Ganti bahan yang dilihat pelajar. Muat naik disimpan dalam pelayar ini sahaja (demo bahagian hadapan).",
  ),
  adminUnit: t3("Unit", "单元", "Unit"),
  adminSlides: t3("Slides (.pptx)", "幻灯片 (.pptx)", "Slaid (.pptx)"),
  adminPdf: t3("Reading (.pdf)", "阅读 (.pdf)", "Bacaan (.pdf)"),
  adminVideo: t3("Video (YouTube URL)", "视频（YouTube 链接）", "Video (URL YouTube)"),
  adminBank: t3("Question bank (.csv)", "题库 (.csv)", "Bank soalan (.csv)"),
  adminUpload: t3("Upload", "上传", "Muat naik"),
  adminReplace: t3("Replace", "替换", "Ganti"),
  adminCustom: t3("Custom file in use", "正在使用自定义文件", "Fail tersuai digunakan"),
  adminDefault: t3("Using bundled file", "使用内置文件", "Menggunakan fail terbina"),
  adminRevert: t3("Revert", "还原", "Kembalikan"),
  adminSave: t3("Save URL", "保存链接", "Simpan URL"),
  adminAttempts: t3("Learner attempts & lockouts", "学员尝试与锁定", "Percubaan & kunci pelajar"),
  adminResetAttempts: t3("Reset attempts", "重置尝试", "Tetapkan semula percubaan"),
  adminSurveyResponses: t3("Survey responses", "问卷反馈", "Maklum balas tinjauan"),
  adminNoSurvey: t3("No survey submitted yet.", "尚无问卷提交。", "Belum ada tinjauan dihantar."),
  adminApplied: t3("Saved — reloading materials…", "已保存 — 正在重新加载…", "Disimpan — memuat semula bahan…"),
  adminViewLabel: t3("View", "视图", "Paparan"),
  adminAsUser: t3("Learner", "学员", "Pelajar"),
  adminAsAdmin: t3("Admin", "管理员", "Admin"),
  openAdmin: t3("Admin Console", "管理控制台", "Konsol Admin"),
  passedLabel: t3("Passed", "已通过", "Lulus"),
  lockedLabel: t3("Locked", "已锁定", "Dikunci"),
  inProgress: t3("In progress", "进行中", "Sedang berjalan"),
  notStarted: t3("Not started", "未开始", "Belum bermula"),

  // ---- screenshot guard ----
  shieldMsg: t3(
    "Protected content hidden",
    "受保护内容已隐藏",
    "Kandungan terlindung disembunyikan",
  ),
  shieldSub: t3(
    "Return to this window to continue.",
    "返回此窗口以继续。",
    "Kembali ke tetingkap ini untuk meneruskan.",
  ),
  screenshotBlocked: t3(
    "Screenshots are disabled for this training.",
    "此培训已禁用截图。",
    "Tangkapan skrin dilumpuhkan untuk latihan ini.",
  ),
};

// ===== icons.jsx =====
// icons.jsx — context (language) helpers + UI icon set for iORA LMS
// Exports to window: LangCtx, useTr, useU, Icon (named glyph component).

const LangCtx = React.createContext("en");

// resolve a {en,zh,ms} object to the current language string
function useTr() {
  const lang = React.useContext(LangCtx);
  return React.useCallback(
    (o) => (o == null ? "" : o[lang] != null ? o[lang] : o.en),
    [lang],
  );
}
// resolve a UI dictionary key
function useU() {
  const lang = React.useContext(LangCtx);
  return React.useCallback(
    (key) => {
      const e = UI[key];
      return e ? (e[lang] != null ? e[lang] : e.en) : key;
    },
    [lang],
  );
}

// ---- icons: clean 1.6px stroke, 24x24 viewBox ------------------------------
const PATHS = {
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  play: <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  slides: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  quiz: (
    <>
      <path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1 1-1.1 1.7v.5" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L21 2M16 7l3 3M14 9l3 3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8" r="6" />
      <path d="M8.2 13.4L7 22l5-3 5 3-1.2-8.6" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
};

function Icon({ name, size = 22, stroke = 2, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

// ===== materials.jsx =====
// materials.jsx — loads the REAL course materials from /materials/{en,ch,ms}/
// and builds the multilingual content the LMS consumes. This replaces the old
// hardcoded placeholder data so the app stops "hallucinating" its own content.
//
// Folder layout (per language):
//   N.pptx   slide deck for lesson N
//   N.pdf    reading for lesson N
//   N.csv    MCQ bank for lesson N   (header: question,a,b,c,d — column 'a' is correct)
//   test.csv MCQ bank for the final test
//   videos.csv  rows of  lessonNumber,youtubeURL
//
// Exposes MAT (helpers used by data.jsx / players). data.jsx defines
// hydrateMaterials() which calls these; app.jsx awaits it before render.

const LANG_DIR = { en: "en", zh: "ch", ms: "ms" }; // UI lang code -> materials folder
const MAT_BASE = "materials";
const LANGS3 = ["en", "zh", "ms"];

// Absolute URL for a material file. Absolute (not relative) so it works inside
// the Office Online viewer, <iframe> and <a download> regardless of route.
// Resolve from the origin (root-absolute) so material URLs are correct on the
// /learning route and remain reachable by the Office Online viewer / iframes.
const matUrl = (lang, file) =>
  new URL(`/${MAT_BASE}/${LANG_DIR[lang]}/${file}`, window.location.origin).href;

// {en,zh,ms} map of URLs for the same file in each language folder.
const langUrls = (file) => ({
  en: matUrl("en", file),
  zh: matUrl("zh", file),
  ms: matUrl("ms", file),
});

// {en,zh,ms} map that points all three languages at the same URL (used for
// admin-uploaded overrides, which are language-agnostic).
const sameUrlAllLangs = (url) => ({ en: url, zh: url, ms: url });
const sameIdAllLangs = (id) => ({ en: id, zh: id, ms: id });

// Microsoft Office Online embed URL for a (publicly reachable) .pptx.
const officeEmbed = (pptxUrl) =>
  "https://view.officeapps.live.com/op/embed.aspx?src=" +
  encodeURIComponent(pptxUrl);

// ---- CSV parsing (RFC-4180-ish: handles quoted fields, commas & quotes inside) ----
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    inQ = false;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // drop blank rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// Fetch a CSV file from all three language folders -> {en:rows|null, zh, ms}.
async function fetchCSVAllLangs(file) {
  const out = {};
  await Promise.all(
    LANGS3.map(async (lng) => {
      try {
        out[lng] = parseCSV(await fetchText(matUrl(lng, file)));
      } catch (e) {
        console.warn(`[materials] could not load ${LANG_DIR[lng]}/${file}:`, e.message);
        out[lng] = null;
      }
    }),
  );
  return out;
}

// ---- seeded RNG so the option shuffle is identical across languages ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic permutation of [0..n-1] from an integer seed (Fisher–Yates).
function permutation(n, seed) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed >>> 0);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build a multilingual MCQ bank from {en,zh,ms} parsed CSVs.
// CSV: header row [question,a,b,c,d...]; column 'a' (data index 1) is the answer.
// Options are shuffled with a per-row seed shared by every language, so the three
// translations stay aligned and the resolved `answer` index is correct.
function buildMCQ(csvByLang, fileSeed) {
  const base = csvByLang.en || csvByLang.zh || csvByLang.ms;
  if (!base || base.length < 2) return [];
  const dataOf = (lng) => {
    const rows = csvByLang[lng] || base;
    return rows.length >= 2 ? rows.slice(1) : base.slice(1);
  };
  const data = { en: dataOf("en"), zh: dataOf("zh"), ms: dataOf("ms") };
  const baseData = base.slice(1);
  const nOpts = Math.max(0, base[0].length - 1); // columns after the question

  return baseData.map((_, r) => {
    const cell = (lng, col) => {
      const rrow = data[lng][r] || baseData[r];
      return rrow && rrow[col] != null ? String(rrow[col]).trim() : "";
    };
    const perm = permutation(nOpts, fileSeed * 1009 + r);
    const q = { en: cell("en", 0), zh: cell("zh", 0), ms: cell("ms", 0) };
    const options = perm.map((origCol) => ({
      en: cell("en", origCol + 1),
      zh: cell("zh", origCol + 1),
      ms: cell("ms", origCol + 1),
    }));
    const answer = perm.indexOf(0); // original column 'a' (index 0) is correct
    return { q, options, answer };
  });
}

// ---- videos.csv -> per-language YouTube id for a given lesson number ----
function youtubeId(url) {
  if (!url) return "";
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : String(url).trim();
}
function buildVideoMap(csvByLang, lessonNo) {
  const pick = (lng) => {
    const rows = csvByLang[lng] || csvByLang.en;
    if (!rows) return "";
    const row = rows.find((r) => String(r[0]).trim() === String(lessonNo));
    return row ? youtubeId(row[1]) : "";
  };
  const en = pick("en");
  return { en, zh: pick("zh") || en, ms: pick("ms") || en };
}

// Randomly pick `n` questions from a bank, in random order (Fisher–Yates).
// Used at the start of each test attempt so 40 of the 60 banked questions are
// presented in a fresh order every time.
function sampleQuestions(bank, n) {
  const arr = bank.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

const MAT = {
  LANG_DIR,
  matUrl,
  langUrls,
  sameUrlAllLangs,
  sameIdAllLangs,
  officeEmbed,
  parseCSV,
  fetchCSVAllLangs,
  buildMCQ,
  buildVideoMap,
  youtubeId,
  sampleQuestions,
};

// ---- admin file overrides (front-end only) ---------------------------------
// Uploaded replacement files are kept in localStorage as a map keyed by
// "<type>:<lessonNo>" — e.g. "csv:1", "pdf:2", "pptx:3", "video:1". CSV values
// are raw text; pdf/pptx are data: URLs; video is a YouTube URL/id. hydrateMaterials()
// reads these and prefers them over the bundled files.
const OV_KEY = "iora-overrides-v1";
const IORA_OVERRIDES = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(OV_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  },
  set(key, value) {
    const all = this.getAll();
    all[key] = value;
    localStorage.setItem(OV_KEY, JSON.stringify(all));
  },
  remove(key) {
    const all = this.getAll();
    delete all[key];
    localStorage.setItem(OV_KEY, JSON.stringify(all));
  },
};

// ===== data.jsx =====
// data.jsx — iORA LMS course definitions.
// The journey is six tiles: Lesson 1 → Test 1 → Lesson 2 → Test 2 → Lesson 3 → Test 3.
// Lessons are learning-only (slides → PDF → video). Each Test is the assessment for
// its unit: a 60-question bank from materials/<lang>/<n>.csv, of which 40 are picked
// at random (in random order) per attempt.
//
// COURSES    = ordered list of the 3 lessons (parts filled in after hydration)
// TESTS      = ordered list of the 3 tests (question banks filled after hydration)
// hydrateMaterials() = async loader, awaited by app.jsx before first render.

const L = t3;

// ---- assessment rules ------------------------------------------------------
const PASS_MARK = 0.75;            // 30 / 40 questions
const TEST_TOTAL = 40;             // questions presented per attempt
const TEST_BANK_SIZE = 60;         // questions authored per bank
const TEST_DURATION_SEC = 30 * 60; // 30-minute timer
const MAX_TEST_ATTEMPTS = 3;       // locked out after the 3rd failed attempt
const UNLOCK_DELAY_DAYS = 14;      // 2 weeks before the next lesson opens

// ---- lesson metadata -------------------------------------------------------
// `mat` is the file stem used under materials/<lang>/ (e.g. 1.pptx, 1.pdf, 1.csv,
// and row "1" in videos.csv).
const LESSONS = [
  {
    id: "lesson1",
    index: 1,
    mat: 1,
    week: 4,
    unlock: "11/06/2026",
    due: "02/07/2026",
    title: L("New Employee Training", "新员工培训", "Latihan Pekerja Baharu"),
    summary: L(
      "Brand, service standards and your first week on the floor.",
      "品牌、服务标准以及您在卖场的第一周。",
      "Jenama, piawaian perkhidmatan dan minggu pertama anda.",
    ),
    pdfName: L(
      "New Employee Handbook.pdf",
      "新员工手册.pdf",
      "Buku Panduan Pekerja Baharu.pdf",
    ),
    videoTitle: L(
      "Welcome to the iORA family",
      "欢迎加入 iORA 大家庭",
      "Selamat datang ke keluarga iORA",
    ),
  },
  {
    id: "lesson2",
    index: 2,
    mat: 2,
    week: 6,
    unlock: "25/06/2026",
    due: "16/07/2026",
    title: L(
      "Fitting & Storeroom Training",
      "试衣间与仓库培训",
      "Latihan Bilik Mencuba & Stor",
    ),
    summary: L(
      "Fitting room service, stockroom organisation and replenishment.",
      "试衣间服务、仓库整理与补货。",
      "Perkhidmatan bilik mencuba, susunan stor dan penambahan stok.",
    ),
    pdfName: L(
      "Stockroom Operations Guide.pdf",
      "仓库运营指南.pdf",
      "Panduan Operasi Stor.pdf",
    ),
    videoTitle: L(
      "Behind the scenes: the stockroom",
      "幕后：仓库运作",
      "Di sebalik tabir: stor",
    ),
  },
  {
    id: "lesson3",
    index: 3,
    mat: 3,
    week: 8,
    unlock: "09/07/2026",
    due: "30/07/2026",
    title: L(
      "Cashier's Responsibility Training",
      "收银员职责培训",
      "Latihan Tanggungjawab Juruwang",
    ),
    summary: L(
      "The POS/SWAIN system, payments, refunds and end-of-day cash-up.",
      "POS/SWAIN 系统、付款、退款与日终结账。",
      "Sistem POS/SWAIN, pembayaran, bayaran balik dan tutup akaun.",
    ),
    pdfName: L(
      "Cashier & POS Manual.pdf",
      "收银与 POS 手册.pdf",
      "Manual Juruwang & POS.pdf",
    ),
    videoTitle: L(
      "Mastering the iORA till",
      "掌握 iORA 收银台",
      "Menguasai kaunter iORA",
    ),
  },
];

// ---- test metadata ---------------------------------------------------------
// Test N is the assessment for Lesson N and draws from materials/<lang>/<N>.csv.
const TEST_DEFS = LESSONS.map((les) => ({
  id: "test" + les.index,
  index: les.index,
  mat: les.mat,
  lessonId: les.id,
  title: L(
    "Test " + les.index,
    "测验 " + les.index,
    "Ujian " + les.index,
  ),
  summary: L(
    `Assessment for Unit ${les.index}. ${TEST_TOTAL} questions · ${TEST_DURATION_SEC / 60} minutes · pass ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}.`,
    `单元 ${les.index} 评估。${TEST_TOTAL} 题 · ${TEST_DURATION_SEC / 60} 分钟 · 及格 ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}。`,
    `Penilaian Unit ${les.index}. ${TEST_TOTAL} soalan · ${TEST_DURATION_SEC / 60} minit · lulus ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}.`,
  ),
}));

// Exposed immediately with empty content; hydrateMaterials() fills them in.
const COURSES = LESSONS.map((m) => ({ ...m, parts: [] }));
const TESTS = TEST_DEFS.map((m) => ({ ...m, bank: [] }));

// ---- runtime hydration from /materials -------------------------------------
const hydrateMaterials = async function hydrateMaterials() {
  const M = MAT;
  const ov = IORA_OVERRIDES ? IORA_OVERRIDES.getAll() : {};

  // videos.csv lives once per language folder; load all up front.
  const videos = await M.fetchCSVAllLangs("videos.csv");

  await Promise.all(
    COURSES.map(async (course) => {
      // slides / pdf urls (admin overrides win, applied to all languages)
      const slideUrls = ov[`pptx:${course.mat}`]
        ? M.sameUrlAllLangs(ov[`pptx:${course.mat}`])
        : M.langUrls(`${course.mat}.pptx`);
      const pdfUrls = ov[`pdf:${course.mat}`]
        ? M.sameUrlAllLangs(ov[`pdf:${course.mat}`])
        : M.langUrls(`${course.mat}.pdf`);
      // video: override is a single URL/id applied to all languages
      const videoMap = ov[`video:${course.mat}`]
        ? M.sameIdAllLangs(M.youtubeId(ov[`video:${course.mat}`]))
        : M.buildVideoMap(videos, course.mat);
      course.parts = [
        { type: "slides", deck: slideUrls },
        { type: "pdf", name: course.pdfName, url: pdfUrls },
        { type: "video", youtubeId: videoMap, title: course.videoTitle },
      ];
    }),
  );

  await Promise.all(
    TESTS.map(async (test) => {
      let csvByLang;
      if (ov[`csv:${test.mat}`]) {
        // a single uploaded CSV applies to every language
        const rows = M.parseCSV(ov[`csv:${test.mat}`]);
        csvByLang = { en: rows, zh: rows, ms: rows };
      } else {
        csvByLang = await M.fetchCSVAllLangs(`${test.mat}.csv`);
      }
      test.bank = M.buildMCQ(csvByLang, 900 + test.mat);
    }),
  );
};

// ===== quiz.jsx =====
// quiz.jsx — timed exam engine for the unit tests.
// Presents the (already-sampled) questions one at a time with prev/next navigation,
// a countdown timer, and a single submit. No per-question answer reveal — it's a test.
// Auto-submits when the timer reaches zero. Reports the result once via onSubmit.
// Relies on globals: Icon, useTr, useU.

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function Quiz({ questions, durationSec, attemptNo, onSubmit }) {
  const tr = useTr();
  const u = useU();
  const total = questions.length;
  const [idx, setIdx] = React.useState(0);
  const [picks, setPicks] = React.useState(() => Array(total).fill(null));
  const [timeLeft, setTimeLeft] = React.useState(durationSec);

  const submittedRef = React.useRef(false);
  const picksRef = React.useRef(picks);
  picksRef.current = picks;

  const finalize = React.useCallback(
    (timedOut) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const p = picksRef.current;
      const correct = questions.reduce(
        (n, q, i) => n + (p[i] === q.answer ? 1 : 0),
        0,
      );
      const answered = p.filter((x) => x != null).length;
      onSubmit({ correct, total, answered, timedOut });
    },
    [questions, total, onSubmit],
  );

  // countdown driven by a fixed deadline so it doesn't drift across re-renders
  React.useEffect(() => {
    const end = Date.now() + durationSec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) finalize(true);
    };
    tick();
    const h = setInterval(tick, 500);
    return () => clearInterval(h);
  }, [durationSec, finalize]);

  const q = questions[idx];
  const answeredCount = picks.filter((x) => x != null).length;
  const pick = (i) => {
    setPicks((prev) => {
      const next = prev.slice();
      next[idx] = i;
      return next;
    });
  };
  const low = timeLeft <= 5 * 60;

  return (
    <div className="quiz exam protect">
      <div className="quiz-top">
        <span className="quiz-step">
          {u("question")} {idx + 1}{" "}
          <span className="dim">
            {u("of")} {total}
          </span>
        </span>
        <div className="quiz-progress">
          <span style={{ width: ((idx + 1) / total) * 100 + "%" }} />
        </div>
        <span className={"quiz-timer" + (low ? " low" : "")}>
          <Icon name="clock" size={16} /> {fmtClock(timeLeft)}
        </span>
      </div>

      <h2 className="quiz-q">{tr(q.q)}</h2>
      <div className="quiz-opts">
        {q.options.map((opt, i) => {
          const cls = "opt" + (i === picks[idx] ? " picked" : "");
          return (
            <button key={i} className={cls} onClick={() => pick(i)}>
              <span className="opt-mark">{String.fromCharCode(65 + i)}</span>
              <span className="opt-text">{tr(opt)}</span>
              {i === picks[idx] && (
                <Icon name="check" size={18} style={{ marginLeft: "auto" }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="quiz-foot exam-foot">
        <button
          className="btn btn-ghost"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          <Icon name="arrowLeft" size={18} /> {u("prevQuestion")}
        </button>
        <span className="exam-count">
          {answeredCount}/{total} {u("answered")}
        </span>
        {idx + 1 < total ? (
          <button
            className="btn btn-blue"
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          >
            {u("nextQuestion")} <Icon name="arrowRight" size={18} />
          </button>
        ) : (
          <button className="btn btn-green" onClick={() => finalize(false)}>
            {u("submitTest")} <Icon name="check" size={18} />
          </button>
        )}
      </div>
      <div className="exam-hint">{u("reviewBeforeSubmit")}</div>
    </div>
  );
}

// ===== slides.jsx =====
// slides.jsx — slide viewer. Embeds the lesson's real .pptx deck via the
// Microsoft Office Online viewer; learner clicks Continue to complete the part.
// Exports: SlideDeck.  Relies on: Icon, useTr, useU, MAT.

const { useState: _useState, useEffect: _useEffect } = React;

function SlideDeck({ deck, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const pptxUrl = tr(deck); // language-specific .pptx URL
  const embedUrl = MAT.officeEmbed(pptxUrl);
  const deckName = u("slidesDeck");

  // allow completion once the learner has had a moment with the deck
  const [ready, setReady] = _useState(done);
  _useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [pptxUrl]);

  return (
    <div className="part slides-part">
      {/* real deck via the Office Online viewer (16:9 frame) */}
      <div className="video-frame">
        <iframe
          src={embedUrl}
          title={deckName}
          frameBorder="0"
          allowFullScreen
        />
      </div>

      <div className="slide-nav">
        <button
          className="btn btn-blue"
          style={{ marginLeft: "auto" }}
          disabled={!ready || done}
          onClick={onComplete}
        >
          {done ? (
            <>
              <Icon name="check" size={18} /> {u("partDone")}
            </>
          ) : (
            <>
              {u("continueTo")} <Icon name="chevronRight" size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ===== lessonPlayer.jsx =====
// lessonPlayer.jsx — lesson player: slides → PDF → video, sequential unlock.
// Lessons are learning-only (the assessment lives in the matching Test). Always
// rendered with the stepper layout. Relies on globals: Icon, useTr, useU, SlideDeck.

const PART_META = [
  { key: "slides", icon: "slides", label: "slides" },
  { key: "pdf", icon: "file", label: "reading" },
  { key: "video", icon: "play", label: "video" },
];

// ---------- PDF ----------
function PdfView({ part, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const url = tr(part.url); // language-specific PDF URL
  // give the learner a moment with the document before enabling completion
  const [ready, setReady] = React.useState(done);
  React.useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [url]);
  // Mobile/touch browsers (notably iOS Safari) render only the first page of a
  // PDF embedded in an <iframe> and won't scroll through the rest. On small
  // screens fall back to Google's viewer, which paginates the whole document.
  // (Google's viewer can't load data: URLs, so admin-uploaded PDFs use the raw src.)
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 860px)").matches;
  const isData = /^data:/.test(url);
  const src =
    isMobile && !isData
      ? `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`
      : `${url}#view=FitH`;
  return (
    <div className="part pdf-part">
      <div className="pdf-doc protect" style={{ padding: 0 }}>
        <iframe
          src={src}
          title={tr(part.name)}
          style={{
            width: "100%",
            height: "clamp(360px, 62vh, 560px)",
            border: 0,
            display: "block",
            background: "#fff",
          }}
        />
      </div>
      <div className="pdf-nav">
        <button
          className="btn btn-blue ml"
          disabled={!ready || done}
          onClick={onComplete}
        >
          {done ? (
            <>
              <Icon name="check" size={18} /> {u("partDone")}
            </>
          ) : (
            u("markRead")
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- Video ----------
function VideoView({ part, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const [ready, setReady] = React.useState(done);
  React.useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const videoId =
    typeof part.youtubeId === "string" ? part.youtubeId : tr(part.youtubeId);
  // pass the page origin so origin-sensitive videos play; enablejsapi for good measure
  const origin =
    typeof window !== "undefined" && window.location
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : "";
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&enablejsapi=1${origin}`;
  return (
    <div className="part video-part">
      <div className="video-frame protect">
        <iframe
          src={embedSrc}
          title={tr(part.title)}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="video-meta">
        <button
          className="btn btn-blue"
          style={{ marginLeft: "auto" }}
          disabled={!ready || done}
          onClick={onComplete}
        >
          {done ? (
            <>
              <Icon name="check" size={18} /> {u("partDone")}
            </>
          ) : ready ? (
            <>
              <Icon name="checkCircle" size={18} /> {u("finishWatching")}
            </>
          ) : (
            u("watchToContinue")
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- part router ----------
function PartContent({ lesson, partIdx, prog, dispatch }) {
  const part = lesson.parts[partIdx];
  const key = PART_META[partIdx].key;
  const done = !!prog.parts[key];
  const complete = () =>
    dispatch({ type: "completePart", lessonId: lesson.id, part: key });

  if (part.type === "slides")
    return <SlideDeck deck={part.deck} done={done} onComplete={complete} />;
  if (part.type === "pdf")
    return <PdfView part={part} done={done} onComplete={complete} />;
  return <VideoView part={part} done={done} onComplete={complete} />;
}

// ---------- part nav helpers ----------
function partUnlocked(prog, idx) {
  if (idx === 0) return true;
  for (let k = 0; k < idx; k++) if (!prog.parts[PART_META[k].key]) return false;
  return true;
}

// ---------- main player (stepper) ----------
function LessonPlayer({ lesson, prog, dispatch, onExit, onLessonDone }) {
  const tr = useTr();
  const u = useU();
  const firstIncomplete = () => {
    for (let k = 0; k < PART_META.length; k++)
      if (!prog.parts[PART_META[k].key] && partUnlocked(prog, k)) return k;
    return PART_META.length - 1;
  };
  const [active, setActive] = React.useState(firstIncomplete());

  const meta = PART_META.map((m, i) => ({
    ...m,
    i,
    done: !!prog.parts[m.key],
    unlocked: partUnlocked(prog, i),
  }));
  const goTo = (i) => {
    if (meta[i].unlocked) setActive(i);
  };

  // auto-advance when a part newly completes; fire onLessonDone after the last one
  const prevDone = React.useRef(prog.parts);
  React.useEffect(() => {
    const justDone = PART_META.find(
      (m, i) => prog.parts[m.key] && !prevDone.current[m.key] && i === active,
    );
    prevDone.current = prog.parts;
    if (justDone) {
      if (active < PART_META.length - 1) {
        const t = setTimeout(() => setActive(active + 1), 550);
        return () => clearTimeout(t);
      }
      // last part complete → lesson done
      const allDone = PART_META.every((m) => prog.parts[m.key]);
      if (allDone && onLessonDone) {
        const t = setTimeout(onLessonDone, 650);
        return () => clearTimeout(t);
      }
    }
  }, [prog.parts]);

  const content = (
    <PartContent
      lesson={lesson}
      partIdx={active}
      prog={prog}
      dispatch={dispatch}
    />
  );

  const header = (
    <div className="player-head">
      <button className="btn btn-ghost back" onClick={onExit}>
        <Icon name="arrowLeft" size={18} /> {u("backToDash")}
      </button>
      <div className="player-titles">
        <span className="player-kicker">
          {u("lesson")} {lesson.index} · {u("week")}{" "}
          {tr({ en: lesson.week, zh: lesson.week, ms: lesson.week })}
          {u("weekSuffix")}
        </span>
        <h1>{tr(lesson.title)}</h1>
      </div>
    </div>
  );

  return (
    <div className="player player-stepper">
      {header}
      <div className="stepper-body">
        <div className="stepper-content">{content}</div>
        <nav className="step-rail">
          {meta.map((m) => (
            <button
              key={m.key}
              className={
                "rail-item" +
                (m.i === active ? " active" : "") +
                (m.done ? " done" : "") +
                (!m.unlocked ? " locked" : "")
              }
              disabled={!m.unlocked}
              onClick={() => goTo(m.i)}
            >
              <span className="rail-ic">
                {m.done ? (
                  <Icon name="check" size={16} />
                ) : !m.unlocked ? (
                  <Icon name="lock" size={14} />
                ) : (
                  <Icon name={m.icon} size={18} />
                )}
              </span>
              <span className="rail-txt">
                <b>{u(m.label)}</b>
                <small>
                  {m.done ? u("partDone") : !m.unlocked ? u("locked") : ""}
                </small>
              </span>
              {m.i < meta.length - 1 && <span className="rail-line" />}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

// ===== dashboard.jsx =====
// dashboard.jsx — onboarding dashboard: header + grid of the six journey tiles
// (Lesson 1, Test 1, Lesson 2, Test 2, Lesson 3, Test 3). The `journey` array is
// computed by the app from the progress/gating state.
// Relies on globals: Icon, useTr, useU.

function Thumb({ label, locked }) {
  return (
    <div className={"thumb" + (locked ? " locked" : "")}>
      <div className="thumb-stripes" />
      <span className="thumb-tag">{label}</span>
    </div>
  );
}

function JourneyCard({ node, onOpen }) {
  const u = useU();
  const tr = useTr();
  const { kind, index, item, locked, complete, pct, lockHint, lockedOut } = node;
  const isTest = kind === "test";
  const title = isTest ? `${u("test")} ${index}` : `${u("lesson")} ${index}`;
  const barColor = complete ? "var(--green)" : isTest ? "var(--blue)" : "var(--green)";
  return (
    <button
      className={
        "lcard" +
        (locked ? " is-locked" : "") +
        (complete ? " is-done" : "") +
        (isTest ? " is-test" : "")
      }
      onClick={() => !locked && onOpen(item)}
      disabled={locked}
      data-screen-label={"card-" + item.id}
    >
      <div className="lcard-thumb">
        <Thumb
          label={`${isTest ? "test" : "lesson"} ${index}`}
          locked={locked}
        />
        {locked && !complete && (
          <div className={"lock-badge" + (lockedOut ? " danger" : "")}>
            <Icon name="lock" size={15} />
            {lockHint && <span>{tr(lockHint)}</span>}
          </div>
        )}
        {complete && (
          <div className="done-badge">
            <Icon name="check" size={15} />
          </div>
        )}
      </div>
      <div className="lcard-foot">
        <div className="lcard-title">{title}</div>
        <div className="lcard-pct">{Math.round(pct)}%</div>
      </div>
      <div className="lcard-bar">
        <span style={{ width: pct + "%", background: barColor }} />
      </div>
    </button>
  );
}

function Dashboard({ journey, onOpen }) {
  const u = useU();
  return (
    <div className="dash">
      <div className="dash-head">
        <h1>{u("myCourses")}</h1>
      </div>
      <div className="card-grid">
        {journey.map((node) => (
          <JourneyCard key={node.key} node={node} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ===== testflow.jsx =====
// testflow.jsx — unit tests (timed, attempt-limited), feedback survey, journey
// complete screen, printable certificate, and the admin console.
// Relies on globals: Icon, useTr, useU, Quiz, MAT, COURSES, TESTS, IORA_OVERRIDES,
//   PASS_MARK, TEST_TOTAL, TEST_DURATION_SEC, MAX_TEST_ATTEMPTS.

// ---------- test stepper rail (shared "stepper theme") ----------
function TestRail({ phaseIdx }) {
  const u = useU();
  const steps = [
    { label: "testInstructions", icon: "file" },
    { label: "quiz", icon: "quiz" },
    { label: "seeResults", icon: "award" },
  ];
  return (
    <nav className="step-rail">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={
            "rail-item static" +
            (i === phaseIdx ? " active" : "") +
            (i < phaseIdx ? " done" : "") +
            (i > phaseIdx ? " locked" : "")
          }
        >
          <span className="rail-ic">
            {i < phaseIdx ? (
              <Icon name="check" size={16} />
            ) : (
              <Icon name={s.icon} size={18} />
            )}
          </span>
          <span className="rail-txt">
            <b>{u(s.label)}</b>
          </span>
          {i < steps.length - 1 && <span className="rail-line" />}
        </div>
      ))}
    </nav>
  );
}

// ---------- result screen ----------
function ResultView({ result, passNeeded, locked, isFinal, onContinue, onRetry, onExit }) {
  const u = useU();
  const passed = result.correct >= passNeeded;
  return (
    <div className="quiz-result">
      <div className={"result-ring " + (passed ? "pass" : "fail")}>
        <Icon name={passed ? "checkCircle" : "alert"} size={48} />
      </div>
      <h2>{passed ? u("passed") : u("failed")}</h2>
      <div className="result-score">
        {u("yourScore")}: <b>{result.correct}/{result.total}</b>
        <span className="result-meta">
          ({u("passMark")} {passNeeded}/{result.total})
        </span>
      </div>
      {result.timedOut && !passed && (
        <p className="result-msg">{u("timeUpMsg")}</p>
      )}
      <p className="result-msg">{passed ? u("passedMsg") : u("failedMsg")}</p>
      {!passed && locked && (
        <div className="hr-flag">
          <Icon name="alert" size={18} /> {u("lockedOutMsg")}
        </div>
      )}
      <div className="result-actions">
        {passed ? (
          <button className="btn btn-green" onClick={onContinue}>
            {isFinal ? u("surveyTitle") : u("backToDash")}{" "}
            <Icon name="arrowRight" size={18} />
          </button>
        ) : locked ? (
          <button className="btn btn-ghost" onClick={onExit}>
            {u("backToDash")}
          </button>
        ) : (
          <button className="btn btn-blue" onClick={onRetry}>
            <Icon name="refresh" size={18} /> {u("tryAgain")}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- test screen (intro → exam → result) ----------
function TestScreen({ test, state, dispatch, onExit, onPassedUnit, onPassedFinal }) {
  const tr = useTr();
  const u = useU();
  const ts = state.tests[test.id] || { attempts: 0, passed: false, locked: false };
  const isFinal = test.index === TESTS.length;
  const passNeeded = Math.ceil(PASS_MARK * TEST_TOTAL);

  const [phase, setPhase] = React.useState("intro"); // intro | exam | result
  const [examQs, setExamQs] = React.useState(null);
  const [result, setResult] = React.useState(null);

  const phaseIdx = phase === "intro" ? 0 : phase === "exam" ? 1 : 2;
  const attemptsLeft = Math.max(0, MAX_TEST_ATTEMPTS - ts.attempts);

  const begin = () => {
    setExamQs(MAT.sampleQuestions(test.bank, TEST_TOTAL));
    setResult(null);
    setPhase("exam");
  };

  const handleSubmit = (res) => {
    const passed = res.correct >= passNeeded;
    const score = res.total ? res.correct / res.total : 0;
    if (passed) dispatch({ type: "passTest", testId: test.id, score });
    else dispatch({ type: "failTest", testId: test.id, score });
    setResult(res);
    setPhase("result");
  };

  const header = (
    <div className="player-head">
      <button className="btn btn-ghost back" onClick={onExit}>
        <Icon name="arrowLeft" size={18} /> {u("backToDash")}
      </button>
      <div className="player-titles">
        <span className="player-kicker">
          {u("test")} {test.index}
        </span>
        <h1>{tr(test.title)}</h1>
      </div>
    </div>
  );

  let body;
  if (phase === "intro") {
    if (ts.locked) {
      body = (
        <div className="quiz-result">
          <div className="result-ring fail">
            <Icon name="lock" size={44} />
          </div>
          <h2>{u("lockedOut")}</h2>
          <p className="result-msg">{u("lockedOutMsg")}</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              {u("backToDash")}
            </button>
          </div>
        </div>
      );
    } else if (ts.passed) {
      body = (
        <div className="quiz-result">
          <div className="result-ring pass">
            <Icon name="checkCircle" size={44} />
          </div>
          <h2>{u("alreadyPassed")}</h2>
          <p className="result-msg">{u("alreadyPassedMsg")}</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              {u("backToDash")}
            </button>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="test-intro">
          <div className="ti-icon">
            <Icon name="quiz" size={40} />
          </div>
          <h2>{u("testInstructions")}</h2>
          <p className="ti-body">{u("testIntro")}</p>
          <div className="ti-facts">
            <div className="ti-fact">
              <Icon name="quiz" size={18} />
              <span>{u("questionsPicked")}</span>
            </div>
            <div className="ti-fact">
              <Icon name="clock" size={18} />
              <span>{TEST_DURATION_SEC / 60} min</span>
            </div>
            <div className="ti-fact">
              <Icon name="checkCircle" size={18} />
              <span>
                {u("passMark")}: {passNeeded}/{TEST_TOTAL}
              </span>
            </div>
            <div className="ti-fact">
              <Icon name="refresh" size={18} />
              <span>
                {u("attemptsLeft")}: {attemptsLeft}
              </span>
            </div>
          </div>
          <button className="btn btn-blue lg" onClick={begin}>
            {u("beginTest")} <Icon name="arrowRight" size={18} />
          </button>
        </div>
      );
    }
  } else if (phase === "exam") {
    body = (
      <Quiz
        questions={examQs}
        durationSec={TEST_DURATION_SEC}
        attemptNo={ts.attempts + 1}
        onSubmit={handleSubmit}
      />
    );
  } else {
    body = (
      <ResultView
        result={result}
        passNeeded={passNeeded}
        locked={ts.locked}
        isFinal={isFinal}
        onContinue={() => (isFinal ? onPassedFinal() : onPassedUnit())}
        onRetry={() => setPhase("intro")}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="player player-stepper test-screen">
      {header}
      <div className="stepper-body">
        <div className="stepper-content">
          <div className="part">{body}</div>
        </div>
        <TestRail phaseIdx={phaseIdx} />
      </div>
    </div>
  );
}

// ---------- feedback survey ----------
function StarRow({ value, onChange }) {
  const u = useU();
  return (
    <div className="srv-scale">
      <span className="srv-end">{u("rateLow")}</span>
      <div className="srv-dots">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={"srv-dot" + (n <= value ? " on" : "")}
            aria-label={String(n)}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="srv-end">{u("rateHigh")}</span>
    </div>
  );
}

function SurveyScreen({ state, dispatch, onDone }) {
  const u = useU();
  const init = (state.survey && state.survey.ratings) || {};
  const [ratings, setRatings] = React.useState({
    clarity: init.clarity || 0,
    pace: init.pace || 0,
    usefulness: init.usefulness || 0,
  });
  const [comment, setComment] = React.useState(
    (state.survey && state.survey.comment) || "",
  );
  const [err, setErr] = React.useState(false);
  const set = (k, v) => setRatings((r) => ({ ...r, [k]: v }));
  const submit = () => {
    if (!ratings.clarity || !ratings.pace || !ratings.usefulness) {
      setErr(true);
      return;
    }
    dispatch({ type: "submitSurvey", ratings, comment });
    onDone();
  };
  const Q = ({ k, label }) => (
    <div className="srv-q">
      <div className="srv-label">{u(label)}</div>
      <StarRow value={ratings[k]} onChange={(v) => set(k, v)} />
    </div>
  );
  return (
    <div className="survey-screen">
      <div className="survey-card">
        <div className="ti-icon">
          <Icon name="award" size={36} />
        </div>
        <h1>{u("surveyTitle")}</h1>
        <p className="ti-body">{u("surveyIntro")}</p>
        <Q k="clarity" label="surveyClarity" />
        <Q k="pace" label="surveyPace" />
        <Q k="usefulness" label="surveyUseful" />
        <div className="srv-q">
          <div className="srv-label">{u("surveyComment")}</div>
          <textarea
            className="srv-text"
            rows={4}
            value={comment}
            placeholder={u("surveyCommentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {err && <div className="srv-err">{u("surveyRequired")}</div>}
        <button className="btn btn-blue lg btn-block" onClick={submit}>
          {u("surveySubmit")} <Icon name="arrowRight" size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------- journey complete ----------
function TestComplete({ state, surveyDone, onCert, onSurvey, onHome }) {
  const u = useU();
  return (
    <div className="complete-screen">
      <div className="complete-card">
        <div className="complete-burst">
          <Icon name="award" size={56} />
        </div>
        <h1>{u("congrats")}</h1>
        <p className="complete-body">{u("congratsBody")}</p>
        <div className="sync-badge">
          <Icon name="checkCircle" size={18} /> {u("syncedToHr")}
        </div>
        <div className="complete-actions">
          <button className="btn btn-ghost" onClick={onHome}>
            {u("backHome")}
          </button>
          {surveyDone ? (
            <button className="btn btn-blue lg" onClick={onCert}>
              <Icon name="download" size={20} /> {u("downloadCert")}
            </button>
          ) : (
            <button className="btn btn-blue lg" onClick={onSurvey}>
              <Icon name="award" size={20} /> {u("takeSurvey")}
            </button>
          )}
        </div>
        {!surveyDone && (
          <div className="cert-gate-note">
            <Icon name="alert" size={16} /> {u("certNeedsSurvey")}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- certificate ----------
function Certificate({ state, onClose }) {
  const u = useU();
  const today = new Date().toLocaleDateString(
    state.lang === "zh" ? "zh-CN" : state.lang === "ms" ? "ms-MY" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" },
  );
  return (
    <div className="cert-overlay">
      <div className="cert-toolbar no-print">
        <button className="btn btn-ghost" onClick={onClose}>
          <Icon name="x" size={18} /> {u("cancel")}
        </button>
        <button className="btn btn-blue" onClick={() => window.print()}>
          <Icon name="download" size={18} /> {u("print")}
        </button>
      </div>
      <div className="cert-sheet">
        <div className="cert-border">
          <div className="cert-brand">iORA</div>
          <div className="cert-h">{u("certTitle")}</div>
          <div className="cert-line">{u("certPresented")}</div>
          <div className="cert-name">{state.userName}</div>
          <div className="cert-line">{u("certHasDone")}</div>
          <div className="cert-prog">{u("certProgram")}</div>
          <div className="cert-seal">
            <Icon name="award" size={40} />
          </div>
          <div className="cert-foot">
            <div className="cert-foot-col">
              <div className="cert-val">{today}</div>
              <div className="cert-cap">{u("certDate")}</div>
            </div>
            <div className="cert-foot-col">
              <div className="cert-sig">John Doe</div>
              <div className="cert-cap">{u("certSign")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- admin console ----------
function FileRow({ labelKey, ovKey, accept, kind, onUpload, onRevert }) {
  const u = useU();
  const overrides = IORA_OVERRIDES.getAll();
  const has = overrides[ovKey] != null;
  const fileRef = React.useRef(null);
  const [url, setUrl] = React.useState(kind === "video" && has ? overrides[ovKey] : "");

  return (
    <div className="adm-file">
      <div className="adm-file-main">
        <div className="adm-file-name">{u(labelKey)}</div>
        <div className={"adm-file-tag" + (has ? " custom" : "")}>
          {has ? u("adminCustom") : u("adminDefault")}
        </div>
      </div>
      <div className="adm-file-actions">
        {kind === "video" ? (
          <>
            <input
              className="adm-input"
              type="text"
              placeholder="https://youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="btn btn-blue sm"
              disabled={!url.trim()}
              onClick={() => onUpload(ovKey, url.trim(), kind)}
            >
              {u("adminSave")}
            </button>
          </>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) onUpload(ovKey, f, kind);
                e.target.value = "";
              }}
            />
            <button
              className="btn btn-ghost sm"
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <Icon name="download" size={16} />{" "}
              {has ? u("adminReplace") : u("adminUpload")}
            </button>
          </>
        )}
        {has && (
          <button className="btn btn-ghost sm" onClick={() => onRevert(ovKey)}>
            {u("adminRevert")}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminConsole({ state, dispatch, onExit, onUpload, onRevert }) {
  const u = useU();
  const tr = useTr();
  const tests = state.tests || {};
  const statusOf = (t) =>
    t.locked
      ? u("lockedLabel")
      : t.passed
        ? u("passedLabel")
        : t.attempts > 0
          ? u("inProgress")
          : u("notStarted");
  const survey = state.survey || {};

  return (
    <div className="admin-console">
      <div className="player-head">
        <button className="btn btn-ghost back" onClick={onExit}>
          <Icon name="arrowLeft" size={18} /> {u("backToDash")}
        </button>
        <div className="player-titles">
          <span className="player-kicker">{u("adminAsAdmin")}</span>
          <h1>{u("adminConsole")}</h1>
        </div>
      </div>

      {/* files */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminFiles")}</h2>
        <p className="adm-hint">{u("adminFilesHint")}</p>
        {COURSES.map((c) => (
          <div key={c.id} className="adm-unit">
            <div className="adm-unit-h">
              {u("adminUnit")} {c.index} — {tr(c.title)}
            </div>
            <FileRow labelKey="adminSlides" ovKey={`pptx:${c.mat}`} accept=".pptx" kind="file" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminPdf" ovKey={`pdf:${c.mat}`} accept=".pdf" kind="file" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminVideo" ovKey={`video:${c.mat}`} accept="" kind="video" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminBank" ovKey={`csv:${c.mat}`} accept=".csv" kind="csv" onUpload={onUpload} onRevert={onRevert} />
          </div>
        ))}
      </section>

      {/* attempts / lockouts */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminAttempts")}</h2>
        <div className="adm-table">
          {TESTS.map((t) => {
            const ts = tests[t.id] || { attempts: 0, passed: false, locked: false };
            return (
              <div key={t.id} className="adm-trow">
                <div className="adm-tcell name">{tr(t.title)}</div>
                <div className="adm-tcell">
                  {u("attempts")}: {ts.attempts}/{MAX_TEST_ATTEMPTS}
                </div>
                <div className={"adm-tcell status" + (ts.locked ? " locked" : ts.passed ? " ok" : "")}>
                  {statusOf(ts)}
                </div>
                <div className="adm-tcell">
                  <button
                    className="btn btn-ghost sm"
                    disabled={ts.attempts === 0 && !ts.locked}
                    onClick={() => dispatch({ type: "resetTestAttempts", testId: t.id })}
                  >
                    <Icon name="refresh" size={15} /> {u("adminResetAttempts")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* survey responses */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminSurveyResponses")}</h2>
        {survey.done ? (
          <div className="adm-survey">
            <div className="adm-srow">
              <span>{u("surveyClarity")}</span>
              <b>{survey.ratings.clarity}/5</b>
            </div>
            <div className="adm-srow">
              <span>{u("surveyPace")}</span>
              <b>{survey.ratings.pace}/5</b>
            </div>
            <div className="adm-srow">
              <span>{u("surveyUseful")}</span>
              <b>{survey.ratings.usefulness}/5</b>
            </div>
            {survey.comment && (
              <div className="adm-comment">“{survey.comment}”</div>
            )}
          </div>
        ) : (
          <p className="adm-hint">{u("adminNoSurvey")}</p>
        )}
      </section>
    </div>
  );
}

// ===== chrome.jsx =====
// chrome.jsx — TopNav, Sidebar, RabbitProgress, dropdowns, password modal, toasts.
// Relies on globals: Icon, useTr, useU, LANGS, UI.

const THEMES = [
  {
    id: "light",
    chrome: "#ffffff",
    bg: "#f1efe9",
    accent: "#1d1b18",
    labelKey: "themeLight",
  },
  {
    id: "dark",
    chrome: "#000000",
    bg: "#221e19",
    accent: "#9a7740",
    labelKey: "themeDark",
  },
  {
    id: "midnight",
    chrome: "#35332d",
    bg: "#ecebe6",
    accent: "#3f3d37",
    labelKey: "themeMidnight",
  },
  {
    id: "maroon",
    chrome: "#48282c",
    bg: "#f5ece9",
    accent: "#8a464d",
    labelKey: "themeMaroon",
  },
  {
    id: "lavender",
    chrome: "#4a3a29",
    bg: "#f4ecdf",
    accent: "#9c7038",
    labelKey: "themeLavender",
  },
  {
    id: "green",
    chrome: "#383d24",
    bg: "#eef0e4",
    accent: "#5f6a34",
    labelKey: "themeGreen",
  },
];

// ---------- Hopping-rabbit progress ----------
function RabbitProgress({ pct, unitsDone, totalUnits = 6 }) {
  const u = useU();
  const done = pct >= 100;
  const n = totalUnits;
  const stoneX = (i) => 6 + ((i + 1) / n) * 80; // milestone stones
  const rabbitX = 6 + (Math.min(pct, 100) / 100) * 80; // rabbit glides along
  return (
    <div className="rabbit-prog">
      <div className="rp-top">
        <span className="rp-pct">{Math.round(pct)}%</span>
        <span className="rp-cap">
          {done ? u("journeyComplete") : u("completed")}
        </span>
      </div>
      <div className="rp-field">
        <div className="rp-ground" />
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className={"rp-stone" + (i < unitsDone ? " done" : "")}
            style={{ left: stoneX(i) + "%" }}
          >
            {i < unitsDone ? "✓" : i === n - 1 ? "🏁" : i + 1}
          </div>
        ))}
        <span className="rp-goal" role="img" aria-label="carrot">
          🥕
        </span>
        <div className="rp-rabbit" style={{ left: rabbitX + "%" }}>
          <span className="rp-bun" role="img" aria-label="rabbit">
            🐰
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({
  pct,
  unitsDone,
  totalUnits = 6,
  upcoming,
  journeyComplete,
  surveyDone,
  onDownloadCert,
}) {
  const tr = useTr();
  const u = useU();
  return (
    <aside className="sidebar">
      <div className="ring-block">
        <RabbitProgress pct={pct} unitsDone={unitsDone} totalUnits={totalUnits} />
      </div>

      <div className="side-card">
        <div className="side-card-h">{u("upcoming")}</div>
        {upcoming ? (
          <div className="upcoming-item">
            <Icon name="clock" size={18} />
            <div>
              <div className="up-title">{tr(upcoming.title)}</div>
              {upcoming.due && (
                <div className="up-date">
                  {u("dueOn")} {upcoming.due}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="up-empty">{u("nothingUpcoming")}</div>
        )}
      </div>

      {journeyComplete && (
        <div className="cert-block">
          <div className="cert-ready">
            <Icon name="award" size={20} />
            <span>{surveyDone ? u("certReady") : u("certNeedsSurvey")}</span>
          </div>
          <button className="btn btn-blue btn-block" onClick={onDownloadCert}>
            {surveyDone ? (
              <>
                <Icon name="download" size={18} /> {u("downloadCert")}
              </>
            ) : (
              <>
                <Icon name="award" size={18} /> {u("takeSurvey")}
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}

// ---------- generic dropdown ----------
function useClickOutside(ref, onClose, active) {
  React.useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [active, onClose]);
}

// ---------- Top nav ----------
function TopNav({ state, dispatch, onNav, profileHref }) {
  const tr = useTr();
  const u = useU();
  const [open, setOpen] = React.useState(null); // 'lang' | 'profile' | 'notif' | null
  const wrap = React.useRef(null);
  useClickOutside(wrap, () => setOpen(null), open !== null && open !== "chat");
  const lang = state.lang;
  const langObj = LANGS.find((l) => l.code === lang);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <header className="topnav" ref={wrap}>
      <button className="brand" onClick={() => onNav({ screen: "dash" })}>
        <span className="brand-word">iORA</span>
        <span className="brand-sub">{u("brandSub")}</span>
      </button>

      <div className="nav-right">
        <button
          className={"nav-icon" + (open === "notif" ? " on" : "")}
          title={u("notifications")}
          onClick={() => setOpen(open === "notif" ? null : "notif")}
        >
          <Icon name="bell" size={22} />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>

        <button
          className="nav-user"
          onClick={() => setOpen(open === "profile" ? null : "profile")}
        >
          <span className="user-name">{state.userName}</span>
          <span className="avatar">
            <Icon name="user" size={20} />
          </span>
          <Icon name="chevronDown" size={16} />
        </button>

        <button
          className="lang-pill"
          onClick={() => setOpen(open === "lang" ? null : "lang")}
        >
          <Icon name="globe" size={16} />
          <span className="lang-label">{langObj.label}</span>
          <span className="lang-label-sm">{langObj.short}</span>
          <Icon name="chevronDown" size={15} />
        </button>

        {/* Language dropdown */}
        {open === "lang" && (
          <div className="dropdown dd-lang">
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={"dd-item" + (l.code === lang ? " active" : "")}
                onClick={() => {
                  dispatch({ type: "setLang", lang: l.code });
                  setOpen(null);
                }}
              >
                <span className="lang-short">{l.short}</span>
                {l.label}
                {l.code === lang && (
                  <Icon name="check" size={16} style={{ marginLeft: "auto" }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Notifications dropdown */}
        {open === "notif" && (
          <div className="dropdown dd-notif">
            <div className="dd-head">
              <span>{u("notifications")}</span>
              {unread > 0 && (
                <button
                  className="dd-link"
                  onClick={() => dispatch({ type: "readAllNotifs" })}
                >
                  {u("markAllRead")}
                </button>
              )}
            </div>
            <div className="notif-list">
              {state.notifications.length === 0 && (
                <div className="notif-empty">{u("noNotifs")}</div>
              )}
              {state.notifications.map((n) => (
                <div key={n.id} className={"notif" + (n.read ? "" : " unread")}>
                  <span className={"notif-dot " + n.kind}></span>
                  <div>
                    <div className="notif-text">{tr(n.text)}</div>
                    <div className="notif-time">{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile dropdown */}
        {open === "profile" && (
          <div className="dropdown dd-profile">
            <div className="profile-head">
              <span className="avatar lg">
                <Icon name="user" size={26} />
              </span>
              <div>
                <div className="pf-name">{state.userName}</div>
                <div className="pf-role">{u("role")}</div>
              </div>
            </div>
            <button
              className="dd-item"
              onClick={() => {
                setOpen(null);
                // Same-app navigation back into the HRMS profile — the shared
                // session cookie means no re-login is needed.
                if (profileHref) window.location.assign(profileHref);
              }}
            >
              <Icon name="user" size={18} /> {u("myProfile")}
            </button>
            <div className="dd-sep"></div>
            <div className="dd-section-label">{u("theme")}</div>
            <div className="theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={
                    "theme-sw" + (state.theme === th.id ? " active" : "")
                  }
                  onClick={() => dispatch({ type: "setTheme", theme: th.id })}
                >
                  <span
                    className="theme-chip"
                    style={{ background: th.chrome }}
                  >
                    <span className="tc-bg" style={{ background: th.bg }} />
                    <i style={{ background: th.accent }} />
                  </span>
                  {u(th.labelKey)}
                </button>
              ))}
            </div>
            <div className="dd-sep"></div>
            <button
              className="dd-item danger"
              onClick={() => {
                setOpen(null);
                dispatch({ type: "logout" });
              }}
            >
              <Icon name="logout" size={18} /> {u("logOut")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- Change password modal ----------
function PasswordModal({ open, onClose, onSaved }) {
  const u = useU();
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{u("changePassword")}</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="form">
          <label>
            {u("currentPw")}
            <input type="password" defaultValue="••••••••" />
          </label>
          <label>
            {u("newPw")}
            <input type="password" />
          </label>
          <label>
            {u("confirmPw")}
            <input type="password" />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {u("cancel")}
          </button>
          <button className="btn btn-blue" onClick={onSaved}>
            {u("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Toast stack ----------
function Toasts({ toasts }) {
  const tr = useTr();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "info")}>
          <Icon name={t.icon || "checkCircle"} size={20} />
          <span>{tr(t.text)}</span>
        </div>
      ))}
    </div>
  );
}

// ===== app.jsx =====
// app.jsx — state (reducer + localStorage), routing, toasts, tweaks, screenshot
// guard, App shell. Relies on globals from all prior files.

const { useReducer, useState, useEffect, useMemo, useCallback, useRef } = React;
const LS_KEY = "iora-lms-v3";

const LESSON_IDS = ["lesson1", "lesson2", "lesson3"];
const TEST_IDS = ["test1", "test2", "test3"];
const PART_KEYS = ["slides", "pdf", "video"];

const emptyLesson = () => ({ parts: {} });
const emptyTest = () => ({
  attempts: 0,
  passed: false,
  bestScore: 0,
  locked: false,
  completedAt: null,
});

// Build initial LMS state, seeded from the HRMS backend. `seed` carries the
// learner's identity (from the session) and any progress/tests/survey already
// synced to the database, so the journey resumes where the learner left off.
function makeInitial(seed) {
  seed = seed || {};
  const sp = seed.progress || {};
  const st = seed.tests || {};
  const lesson = (id) =>
    sp[id] ? { parts: { ...(sp[id].parts || {}) } } : emptyLesson();
  const test = (id) => (st[id] ? { ...emptyTest(), ...st[id] } : emptyTest());
  return {
    lang: seed.lang || "en",
    theme: seed.theme || "light",
    userName: seed.userName || "Learner",
    role: seed.role || "user", // "user" | "admin"
    progress: {
      lesson1: lesson("lesson1"),
      lesson2: lesson("lesson2"),
      lesson3: lesson("lesson3"),
    },
    tests: { test1: test("test1"), test2: test("test2"), test3: test("test3") },
    survey: seed.survey || {
      done: false,
      ratings: { clarity: 0, pace: 0, usefulness: 0 },
      comment: "",
    },
    notifications: [
      {
        id: "u1",
        kind: "info",
        read: false,
        time: "just now",
        text: {
          en: "Lesson 1 is now available",
          zh: "课程 1 已开放",
          ms: "Pelajaran 1 kini tersedia",
        },
      },
    ],
    hrEvents: [],
  };
}

const idxOfTest = (testId) => TEST_IDS.indexOf(testId) + 1;
const notif = (en, zh, ms, kind = "done") => ({
  id: kind + Date.now() + Math.random().toString(36).slice(2, 6),
  kind,
  read: false,
  time: "just now",
  text: { en, zh, ms },
});

function reducer(s, a) {
  switch (a.type) {
    case "setLang":
      return { ...s, lang: a.lang };
    case "setSimDate":
      return { ...s, simDate: a.value };
    case "setTheme":
      return { ...s, theme: a.theme };
    case "setRole":
      return { ...s, role: a.role };
    case "readAllNotifs":
      return {
        ...s,
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
      };
    case "completePart": {
      const p = { ...s.progress };
      const parts = { ...p[a.lessonId].parts, [a.part]: true };
      p[a.lessonId] = { ...p[a.lessonId], parts };
      const idx = LESSON_IDS.indexOf(a.lessonId) + 1;
      const justFinished = PART_KEYS.every((k) => parts[k]);
      const extra = justFinished
        ? {
            notifications: [
              notif(
                `Lesson ${idx} completed`,
                `课程 ${idx} 已完成`,
                `Pelajaran ${idx} selesai`,
              ),
              ...s.notifications,
            ],
            hrEvents: [
              ...s.hrEvents,
              {
                at: Date.now(),
                type: "lesson_complete",
                detail: `Lesson ${idx} completed`,
              },
            ],
          }
        : {};
      return { ...s, progress: p, ...extra };
    }
    case "passTest": {
      const idx = idxOfTest(a.testId);
      const today = s.simDate || Date.now();
      const prev = s.tests[a.testId];
      const tests = {
        ...s.tests,
        [a.testId]: {
          attempts: (prev.attempts || 0) + 1,
          passed: true,
          bestScore: Math.max(prev.bestScore || 0, a.score),
          locked: false,
          completedAt: prev.completedAt || today,
        },
      };
      return {
        ...s,
        tests,
        notifications: [
          notif(
            `Test ${idx} passed`,
            `测验 ${idx} 已通过`,
            `Ujian ${idx} lulus`,
          ),
          ...s.notifications,
        ],
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "test_passed",
            detail: `Test ${idx} passed (${Math.round(a.score * 100)}%)`,
          },
        ],
      };
    }
    case "failTest": {
      const idx = idxOfTest(a.testId);
      const prev = s.tests[a.testId];
      const attempts = (prev.attempts || 0) + 1;
      const locked = attempts >= MAX_TEST_ATTEMPTS;
      const tests = {
        ...s.tests,
        [a.testId]: {
          ...prev,
          attempts,
          locked,
          bestScore: Math.max(prev.bestScore || 0, a.score),
        },
      };
      const hr = [
        ...s.hrEvents,
        {
          at: Date.now(),
          type: locked ? "retake_lockout" : "test_failed",
          detail: locked
            ? `Test ${idx}: ${attempts} failed attempts — locked, HR escalation`
            : `Test ${idx} failed attempt ${attempts}`,
        },
      ];
      const notes = locked
        ? [
            notif(
              `Test ${idx} locked after 3 attempts`,
              `测验 ${idx} 在 3 次尝试后已锁定`,
              `Ujian ${idx} dikunci selepas 3 percubaan`,
              "alert",
            ),
            ...s.notifications,
          ]
        : s.notifications;
      return { ...s, tests, hrEvents: hr, notifications: notes };
    }
    case "resetTestAttempts": {
      const idx = idxOfTest(a.testId);
      const prev = s.tests[a.testId];
      return {
        ...s,
        tests: { ...s.tests, [a.testId]: { ...prev, attempts: 0, locked: false } },
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "attempts_reset",
            detail: `Admin reset attempts for Test ${idx}`,
          },
        ],
      };
    }
    case "submitSurvey": {
      return {
        ...s,
        survey: { done: true, ratings: a.ratings, comment: a.comment || "" },
        hrEvents: [
          ...s.hrEvents,
          { at: Date.now(), type: "survey_submitted", detail: "Feedback survey submitted" },
        ],
      };
    }
    case "devCompleteAll": {
      const p = {};
      LESSON_IDS.forEach((id) => {
        p[id] = { parts: { slides: true, pdf: true, video: true } };
      });
      const t = {};
      const today = s.simDate || Date.now();
      TEST_IDS.forEach((id) => {
        t[id] = {
          attempts: 1,
          passed: true,
          bestScore: 1,
          locked: false,
          completedAt: today,
        };
      });
      return {
        ...s,
        progress: p,
        tests: t,
        survey: {
          done: true,
          ratings: { clarity: 5, pace: 5, usefulness: 5 },
          comment: "(demo auto-fill)",
        },
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "journey_complete",
            detail: "All lessons & tests auto-completed (demo)",
          },
        ],
      };
    }
    case "reset":
      return makeInitial();
    default:
      return s;
  }
}

// ---- static config (font) ----
const TWEAK_DEFAULTS = { font: "Public Sans" };

const FONT_STACKS = {
  "Public Sans": "'Public Sans', system-ui, sans-serif",
  Figtree: "'Figtree', system-ui, sans-serif",
  Mulish: "'Mulish', system-ui, sans-serif",
  "system-ui": "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- screenshot guard (best-effort web deterrents) ----
function ScreenGuard() {
  const u = useU();
  const [hidden, setHidden] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    // Ignore blur caused by focusing an embedded iframe (video / slides / PDF) —
    // that's interaction with our own content, not the user leaving the page.
    const hide = () => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "IFRAME"
      )
        return;
      setHidden(true);
    };
    const show = () => setHidden(false);
    const onVis = () => setHidden(document.hidden);
    const onCtx = (e) => {
      if (e.target.closest && e.target.closest(".cert-overlay")) return;
      e.preventDefault();
    };
    const onCopy = (e) => {
      if (e.target.closest && e.target.closest(".protect")) e.preventDefault();
    };
    const onKey = (e) => {
      const k = e.key || "";
      if (k === "PrintScreen") {
        try {
          navigator.clipboard && navigator.clipboard.writeText("");
        } catch (_) {}
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      window.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <>
      {hidden && (
        <div className="screen-shield">
          <Icon name="lock" size={40} />
          <div className="ss-title">{u("shieldMsg")}</div>
          <div className="ss-sub">{u("shieldSub")}</div>
        </div>
      )}
      {flash && <div className="ss-flash" />}
    </>
  );
}

function App({ seed, profileHref, saveLearning, onLogout }) {
  const [state, rawDispatch] = useReducer(reducer, seed, makeInitial);
  const [route, setRoute] = useState({ screen: "dash" });
  const [certOpen, setCertOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [matVersion, setMatVersion] = useState(0);

  // Sync learning progress to the HRMS backend (debounced). The database is the
  // source of truth; this replaces the SPA's localStorage persistence. We skip
  // the very first render so seeding from the server doesn't echo straight back.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (typeof saveLearning !== "function") return;
    const snapshot = {
      progress: state.progress,
      tests: state.tests,
      survey: state.survey,
    };
    const h = setTimeout(() => {
      Promise.resolve(saveLearning(snapshot)).catch((e) =>
        console.error("[learning] sync failed:", e),
      );
    }, 600);
    return () => clearTimeout(h);
  }, [state.progress, state.tests, state.survey, saveLearning]);

  const pushToast = useCallback((text, icon = "checkCircle", kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, text, icon, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400);
  }, []);

  const dispatch = useCallback(
    (a) => {
      switch (a.type) {
        case "logout":
          if (typeof onLogout === "function") onLogout();
          return;
        default:
          rawDispatch(a);
      }
    },
    [onLogout],
  );

  // ---- admin: file overrides ----
  const reloadMaterials = useCallback(() => {
    window
      .hydrateMaterials()
      .then(() => setMatVersion((v) => v + 1))
      .catch((e) => console.error("[materials] reload failed:", e));
  }, []);

  const onUpload = useCallback(
    (key, fileOrValue, kind) => {
      const done = () => {
        reloadMaterials();
        pushToast(UI.adminApplied, "checkCircle");
      };
      if (kind === "video") {
        IORA_OVERRIDES.set(key, fileOrValue);
        done();
      } else if (kind === "csv") {
        const reader = new FileReader();
        reader.onload = () => {
          IORA_OVERRIDES.set(key, String(reader.result));
          done();
        };
        reader.readAsText(fileOrValue);
      } else {
        // pdf / pptx → data URL
        const reader = new FileReader();
        reader.onload = () => {
          IORA_OVERRIDES.set(key, String(reader.result));
          done();
        };
        reader.readAsDataURL(fileOrValue);
      }
    },
    [reloadMaterials, pushToast],
  );

  const onRevert = useCallback(
    (key) => {
      IORA_OVERRIDES.remove(key);
      reloadMaterials();
      pushToast(UI.adminApplied, "refresh");
    },
    [reloadMaterials, pushToast],
  );

  // ---- derived: gating + journey ----
  const D = useMemo(() => {
    const parseDue = (str) => {
      const [d, m, y] = str.split("/").map(Number);
      return new Date(y, m - 1, d);
    };
    const today = state.simDate ? new Date(state.simDate) : new Date();

    const lessonComplete = (id) =>
      PART_KEYS.every((k) => state.progress[id].parts[k]);
    const lessonPct = (id) =>
      (PART_KEYS.filter((k) => state.progress[id].parts[k]).length /
        PART_KEYS.length) *
      100;

    const testOf = (n) => state.tests["test" + n];
    const lessonUnlockDate = (n) => {
      // lesson n (>=2) opens 2 weeks after test (n-1) is completed
      const prev = testOf(n - 1);
      if (!prev || !prev.passed || !prev.completedAt) return null;
      return new Date(prev.completedAt + UNLOCK_DELAY_DAYS * DAY_MS);
    };
    const lessonUnlocked = (n) => {
      if (n === 1) return true;
      const d = lessonUnlockDate(n);
      return !!d && today >= d;
    };
    const testUnlocked = (n) => lessonComplete("lesson" + n);
    const testPassed = (n) => testOf(n).passed;
    const testLocked = (n) => testOf(n).locked;

    const lessonsDone = LESSON_IDS.filter(lessonComplete).length;
    const testsDone = TEST_IDS.filter((id) => state.tests[id].passed).length;
    const unitsDone = lessonsDone + testsDone;
    const overall = (unitsDone / 6) * 100;
    const allTestsPassed = testsDone === 3;

    // build the 6-tile journey
    const fmt = (d) =>
      d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const journey = [];
    COURSES.forEach((c) => {
      const n = c.index;
      const complete = lessonComplete(c.id);
      const unlocked = lessonUnlocked(n);
      let lockHint = null;
      if (!unlocked) {
        const prevPassed = testOf(n - 1) && testOf(n - 1).passed;
        if (!prevPassed) {
          lockHint = t3(
            `Pass Test ${n - 1} first`,
            `请先通过测验 ${n - 1}`,
            `Lulus Ujian ${n - 1} dahulu`,
          );
        } else {
          const d = lessonUnlockDate(n);
          const ds = d ? fmt(d) : "";
          lockHint = t3(`Opens ${ds}`, `${ds} 开放`, `Buka ${ds}`);
        }
      }
      journey.push({
        key: c.id,
        kind: "lesson",
        index: n,
        item: c,
        title: c.title,
        complete,
        locked: !unlocked,
        pct: lessonPct(c.id),
        lockHint,
        lockedOut: false,
      });

      const test = TESTS[n - 1];
      const tUnlocked = testUnlocked(n);
      const tLocked = testLocked(n);
      const tPassed = testPassed(n);
      let tHint = null;
      if (tLocked) {
        tHint = t3("Locked", "已锁定", "Dikunci");
      } else if (!tUnlocked) {
        tHint = t3(
          `Finish Lesson ${n} first`,
          `请先完成课程 ${n}`,
          `Selesaikan Pelajaran ${n} dahulu`,
        );
      }
      journey.push({
        key: test.id,
        kind: "test",
        index: n,
        item: test,
        title: test.title,
        complete: tPassed,
        locked: tLocked || (!tUnlocked && !tPassed),
        pct: tPassed ? 100 : 0,
        lockHint: tHint,
        lockedOut: tLocked,
      });
    });

    // first actionable item → "upcoming"
    const upNode = journey.find((nd) => !nd.complete && !nd.locked);
    const upcoming = upNode
      ? {
          title: upNode.title,
          due: upNode.kind === "lesson" ? upNode.item.due : null,
        }
      : null;

    // next still-locked lesson that's waiting on a date (powers the sim tweak)
    let nextLockedDate = null;
    let nextLockedLabel = null;
    for (let n = 2; n <= 3; n++) {
      if (!lessonUnlocked(n)) {
        const d = lessonUnlockDate(n);
        if (d && today < d) {
          nextLockedDate = d;
          nextLockedLabel = "Lesson " + n;
          break;
        }
      }
    }

    return {
      today,
      parseDue,
      lessonComplete,
      lessonPct,
      lessonUnlocked,
      testUnlocked,
      journey,
      overall,
      unitsDone,
      allTestsPassed,
      upcoming,
      nextLockedDate,
      nextLockedLabel,
    };
  }, [state, matVersion]);

  const openItem = (item) => {
    if (TEST_IDS.includes(item.id)) setRoute({ screen: "test", testId: item.id });
    else setRoute({ screen: "lesson", lessonId: item.id });
  };
  const goDash = () => setRoute({ screen: "dash" });

  // cert is gated behind the feedback survey
  const onDownloadCert = () => {
    if (!D.allTestsPassed) return;
    if (!state.survey.done) {
      setRoute({ screen: "survey" });
      return;
    }
    setCertOpen(true);
  };

  const rootStyle = { "--font": FONT_STACKS["Public Sans"] };

  let screen = null;
  if (route.screen === "dash") {
    screen = <Dashboard journey={D.journey} onOpen={openItem} />;
  } else if (route.screen === "lesson") {
    const lesson = COURSES.find((c) => c.id === route.lessonId);
    screen = (
      <LessonPlayer
        key={lesson.id + ":" + matVersion}
        lesson={lesson}
        prog={state.progress[lesson.id]}
        dispatch={dispatch}
        onExit={goDash}
        onLessonDone={() => setTimeout(goDash, 200)}
      />
    );
  } else if (route.screen === "test") {
    const test = TESTS.find((x) => x.id === route.testId);
    screen = (
      <TestScreen
        key={test.id + ":" + matVersion}
        test={test}
        state={state}
        dispatch={dispatch}
        onExit={goDash}
        onPassedUnit={() => setTimeout(goDash, 150)}
        onPassedFinal={() =>
          setRoute({ screen: state.survey.done ? "complete" : "survey" })
        }
      />
    );
  } else if (route.screen === "survey") {
    screen = (
      <SurveyScreen
        state={state}
        dispatch={dispatch}
        onDone={() => {
          pushToast(UI.surveyThanks, "checkCircle");
          setRoute({ screen: "complete" });
        }}
      />
    );
  } else if (route.screen === "complete") {
    screen = (
      <TestComplete
        state={state}
        surveyDone={state.survey.done}
        onCert={() => setCertOpen(true)}
        onSurvey={() => setRoute({ screen: "survey" })}
        onHome={goDash}
      />
    );
  } else if (route.screen === "admin") {
    screen = (
      <AdminConsole
        key={matVersion}
        state={state}
        dispatch={dispatch}
        onExit={goDash}
        onUpload={onUpload}
        onRevert={onRevert}
      />
    );
  }

  return (
    <LangCtx.Provider value={state.lang}>
      <div
        className={"app lang-" + state.lang}
        style={rootStyle}
        data-theme={state.theme}
        data-screen-label={"screen-" + route.screen}
      >
        <TopNav
          state={state}
          dispatch={dispatch}
          onNav={(r) => setRoute(r)}
          profileHref={profileHref}
        />
        <div className="app-body">
          <Sidebar
            pct={D.overall}
            unitsDone={D.unitsDone}
            totalUnits={6}
            upcoming={D.upcoming}
            journeyComplete={D.allTestsPassed}
            surveyDone={state.survey.done}
            onDownloadCert={onDownloadCert}
          />
          <main className="main">{screen}</main>
        </div>

        {certOpen && <Certificate state={state} onClose={() => setCertOpen(false)} />}
        <Toasts toasts={toasts} />
        <ScreenGuard />
      </div>
    </LangCtx.Provider>
  );
}

// ---- boot: load real materials before rendering the app ----
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#f5f4f0",
        color: "#5f5a52",
        fontFamily: "'Public Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 700,
          fontSize: 40,
          color: "#211e1a",
        }}
      >
        iORA
      </div>
      <div style={{ fontSize: 15 }}>Loading course materials…</div>
    </div>
  );
}

function Boot(props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateMaterials()
      .catch((e) => console.error("[materials] hydration failed:", e))
      .finally(() => setReady(true));
  }, []);
  return ready ? <App {...props} /> : <LoadingScreen />;
}

// ---- Next.js entry: inject the LMS stylesheet (scoped to this mounted tree,
// so it does not leak into the rest of HRMS) and boot the app with the
// server-provided session identity + synced progress. ----
export default function LearningApp({ seed, profileHref, saveLearning, onLogout }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LMS_CSS }} />
      <Boot
        seed={seed}
        profileHref={profileHref}
        saveLearning={saveLearning}
        onLogout={onLogout}
      />
    </>
  );
}

