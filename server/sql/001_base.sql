-- Empty core schema for a NEW database. No accounts, tokens or client records.
-- Run through npm run setup:db, which refuses a non-empty database.

CREATE TABLE teams (
  teams_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL,
  teams_teams_id INT NULL,
  CONSTRAINT teams_teams_fk FOREIGN KEY (teams_teams_id) REFERENCES teams (teams_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user (
  user_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  teams_teams_id INT NOT NULL,
  role ENUM('ADMIN', 'TL', 'TM') NOT NULL DEFAULT 'TM',
  UNIQUE KEY user_email_uk (email),
  CONSTRAINT user_teams_fk FOREIGN KEY (teams_teams_id) REFERENCES teams (teams_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE client (
  client_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_first_name VARCHAR(30) NOT NULL,
  client_middle_name VARCHAR(30) NOT NULL,
  client_last_name VARCHAR(30) NOT NULL,
  client_display_name VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL,
  contact_point VARCHAR(30) NOT NULL,
  user_user_id INT NOT NULL,
  CONSTRAINT client_user_fk FOREIGN KEY (user_user_id) REFERENCES user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE contact_point (
  contact_point_id INT NOT NULL AUTO_INCREMENT,
  contact_info VARCHAR(45) NULL,
  contact_type VARCHAR(20) NULL,
  client_id INT NOT NULL,
  PRIMARY KEY (contact_point_id, client_id),
  UNIQUE KEY uq_client_contact_type (client_id, contact_type),
  CONSTRAINT client_contact_fk FOREIGN KEY (client_id) REFERENCES client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE conversation (
  conversation_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(15) NOT NULL,
  page_id VARCHAR(255) NOT NULL,
  access_token VARCHAR(255) NOT NULL,
  token_refreshed_at DATETIME NOT NULL,
  page_created_at DATETIME NOT NULL,
  conversation_created_at DATETIME NOT NULL,
  conversation_id_ext VARCHAR(255) NOT NULL,
  client_psid VARCHAR(255) NOT NULL,
  last_message_at DATETIME NOT NULL,
  last_message_who DATETIME NOT NULL,
  user_user_id INT NOT NULL,
  client_client_id INT NOT NULL,
  CONSTRAINT conversation_user_fk FOREIGN KEY (user_user_id) REFERENCES user (user_id),
  CONSTRAINT conversation_client_fk FOREIGN KEY (client_client_id) REFERENCES client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE message (
  message_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sender_type VARCHAR(10) NOT NULL,
  receiver_type VARCHAR(15) NOT NULL,
  message_content VARCHAR(5000) NOT NULL,
  status VARCHAR(15) NOT NULL,
  created_at DATETIME NOT NULL,
  sent_at DATETIME NOT NULL,
  conversation_conversation_id INT NOT NULL,
  CONSTRAINT message_conversation_fk FOREIGN KEY (conversation_conversation_id)
    REFERENCES conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tasks (
  task_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  due_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NOT NULL,
  status VARCHAR(15) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  user_user_id INT NOT NULL,
  client_client_id INT NOT NULL,
  conversation_conversation_id INT NOT NULL,
  CONSTRAINT tasks_user_fk FOREIGN KEY (user_user_id) REFERENCES user (user_id),
  CONSTRAINT tasks_client_fk FOREIGN KEY (client_client_id) REFERENCES client (client_id),
  CONSTRAINT tasks_conversation_fk FOREIGN KEY (conversation_conversation_id)
    REFERENCES conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
