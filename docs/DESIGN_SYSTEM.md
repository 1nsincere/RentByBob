# Design system
Warm background #F7F7F2, white surfaces, text #202824, secondary #47534B, action/focus #245A81, hover #194260, borders #77857C, error #992525. Statuses always include words. Button disabled background #EEF0ED; notice #F1F5F8. Contrast measurements recorded in STATUS after verification.

System sans, body/input/button 18px, secondary 16.2px, headings roughly 23–32px, balances 36px with tabular numerals. Line height 1.5. Relative spacing, bordered white cards, no animation or imagery. Controls target minimum 44px, 3px focus outline with 4px offset; semantic landmarks and skip link. Flexible navigation and auto-fit forms.

Atomic design kept light: shared Button/Badge atoms; labeled fields and summary patterns currently colocated in the small prototype. Extract molecules, payment/review organisms and staff/renter templates when workflows become real rather than building speculative abstractions. Business logic will live outside visual components.

Design reference includes default/focusable buttons, disabled/loading examples, empty/error text, pending/verified/clarification states. Payment form remains a non-saving demonstration; it now includes field errors linked with aria-describedby, a focusable alert summary, preserved input on validation/edit, and a preview of exact entered values. Review moves focus to its heading; editing returns focus to the form review button. Real submissions still need in-flight state, safe retries and server-confirmed outcomes. No simulated submission success is shown.

Review gate: user validates wording, font size and renter/staff layouts before interface expansion. Keyboard, screen-reader announcements, 200% zoom, mobile reflow and all actual color pairs must be verified. Static styling alone does not establish WCAG 2.2 AA conformance.
