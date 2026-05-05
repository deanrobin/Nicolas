"""Nicolas auditor worker — polls the DB for pending submissions, runs
deterministic prechecks in Python, and only escalates ambiguous content to
the auditor LLM."""
