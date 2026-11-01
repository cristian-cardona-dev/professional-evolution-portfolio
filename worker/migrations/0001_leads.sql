-- Lead capture table
CREATE TABLE IF NOT EXISTS leads (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT,
	email TEXT NOT NULL,
	intent TEXT NOT NULL,
	message TEXT NOT NULL,
	locale TEXT NOT NULL DEFAULT 'en',
	timestamp TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(intent);