-- Additive dashboard extension; existing users and clients are preserved.
CREATE TABLE IF NOT EXISTS client_crm_details (
  client_id INT NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  source VARCHAR(40) NOT NULL DEFAULT 'Other',
  stage VARCHAR(25) NOT NULL DEFAULT 'New lead',
  property_interest VARCHAR(160) NOT NULL DEFAULT '',
  budget DECIMAL(14,2) DEFAULT NULL,
  notes TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT details_client_fk FOREIGN KEY (client_id) REFERENCES client(client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
