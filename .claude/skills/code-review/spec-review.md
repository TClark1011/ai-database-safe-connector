# Spec review

Review whether a diff faithfully implements its originating ticket or spec. Your brief gives you the diff commands, the commit list when there is one, and the spec's location (a path, URL, or ticket ID plus the tool that fetches it).

Read the spec in full, including linked sub-tasks or acceptance criteria. If you can't reach it, report that and stop.

Report:

- (a) requirements the spec asked for that are missing or partial;
- (b) behaviour in the diff that wasn't asked for (scope creep);
- (c) requirements that look implemented but where the implementation looks wrong.

Quote the spec line for each finding. Under 400 words.
