-- 데이터베이스 스키마 생성 및 초기 테스트 데이터를 추가하는 초기화 SQL 스크립트
CREATE DATABASE IF NOT EXISTS fair_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fair_db;

-- 1. 대그룹 테이블
CREATE TABLE IF NOT EXISTS fair_group (
  fg_id INT AUTO_INCREMENT PRIMARY KEY,
  fg_name VARCHAR(255) NOT NULL,
  fg_period VARCHAR(100),
  fg_status VARCHAR(20) DEFAULT '준비중',
  fg_code VARCHAR(100) NOT NULL UNIQUE,
  fg_enroll_open TINYINT(1) NOT NULL DEFAULT 1,
  fg_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. 부문 테이블
CREATE TABLE IF NOT EXISTS fair_buman (
  fb_id INT AUTO_INCREMENT PRIMARY KEY,
  fb_fg_id INT NOT NULL,
  fb_prefix VARCHAR(10) NOT NULL,
  fb_group VARCHAR(100) DEFAULT '',
  fb_name VARCHAR(100) NOT NULL,
  fb_type VARCHAR(20) NOT NULL,
  FOREIGN KEY (fb_fg_id) REFERENCES fair_group(fg_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. 평가자 테이블
CREATE TABLE IF NOT EXISTS fair_judge (
  fj_id INT AUTO_INCREMENT PRIMARY KEY,
  fj_fg_id INT NOT NULL,
  fj_name VARCHAR(50) NOT NULL,
  fj_affiliation VARCHAR(100),
  fj_role VARCHAR(50),
  FOREIGN KEY (fj_fg_id) REFERENCES fair_group(fg_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3-1. 평가자-부문 매핑 테이블 (평가자별 담당 부문 다중 지정)
CREATE TABLE IF NOT EXISTS fair_judge_buman (
  fjb_id INT AUTO_INCREMENT PRIMARY KEY,
  fjb_fb_id INT NOT NULL,
  fjb_fj_id INT NOT NULL,
  FOREIGN KEY (fjb_fb_id) REFERENCES fair_buman(fb_id) ON DELETE CASCADE,
  FOREIGN KEY (fjb_fj_id) REFERENCES fair_judge(fj_id) ON DELETE CASCADE,
  UNIQUE KEY uq_fjb (fjb_fb_id, fjb_fj_id)
) ENGINE=InnoDB;


-- 4. 제품 테이블
CREATE TABLE IF NOT EXISTS fair_product (
  fp_id INT AUTO_INCREMENT PRIMARY KEY,
  fp_fb_id INT NOT NULL,
  fp_code VARCHAR(20) NOT NULL,
  fp_name VARCHAR(100),
  FOREIGN KEY (fp_fb_id) REFERENCES fair_buman(fb_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. 평가 템플릿 테이블
CREATE TABLE IF NOT EXISTS fair_evaluation_template (
  fet_id INT AUTO_INCREMENT PRIMARY KEY,
  fet_fg_id INT NOT NULL,
  fet_target_type VARCHAR(30) NOT NULL,
  fet_target_id INT NULL,
  FOREIGN KEY (fet_fg_id) REFERENCES fair_group(fg_id) ON DELETE CASCADE,
  UNIQUE KEY uq_fet (fet_fg_id, fet_target_type, fet_target_id)
) ENGINE=InnoDB;

-- 6. 평가 항목 테이블
CREATE TABLE IF NOT EXISTS fair_evaluation_item (
  fei_id INT AUTO_INCREMENT PRIMARY KEY,
  fei_fet_id INT NOT NULL,
  fei_group_name VARCHAR(50) NOT NULL,
  fei_name VARCHAR(100) NOT NULL,
  fei_max_score INT NOT NULL,
  fei_convert_to INT,
  fei_scale_values VARCHAR(255) NULL DEFAULT NULL,
  FOREIGN KEY (fei_fet_id) REFERENCES fair_evaluation_template(fet_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. 점수 기록 테이블
CREATE TABLE IF NOT EXISTS fair_score_record (
  fsr_id INT AUTO_INCREMENT PRIMARY KEY,
  fsr_fj_id INT NOT NULL,
  fsr_fp_id INT NOT NULL,
  fsr_fei_id INT NOT NULL,
  fsr_score INT NOT NULL,
  FOREIGN KEY (fsr_fj_id) REFERENCES fair_judge(fj_id) ON DELETE CASCADE,
  FOREIGN KEY (fsr_fp_id) REFERENCES fair_product(fp_id) ON DELETE CASCADE,
  FOREIGN KEY (fsr_fei_id) REFERENCES fair_evaluation_item(fei_id) ON DELETE CASCADE,
  UNIQUE KEY uq_fsr (fsr_fj_id, fsr_fp_id, fsr_fei_id)
) ENGINE=InnoDB;

-- 8. 기기 인증 테이블 (전용 태블릿 등록/승인)
CREATE TABLE IF NOT EXISTS fair_device (
  fd_id INT AUTO_INCREMENT PRIMARY KEY,
  fd_fg_id INT NOT NULL,
  fd_device_key VARCHAR(64) NOT NULL,
  fd_label VARCHAR(100) DEFAULT '',
  fd_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | blocked
  fd_auth_key VARCHAR(128) DEFAULT NULL,
  fd_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fd_last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fd_fg_id) REFERENCES fair_group(fg_id) ON DELETE CASCADE,
  UNIQUE KEY uq_device (fd_fg_id, fd_device_key)
) ENGINE=InnoDB;

-- 9. 관리자 계정 테이블
CREATE TABLE IF NOT EXISTS fair_admin (
  fa_id INT AUTO_INCREMENT PRIMARY KEY,
  fa_username VARCHAR(100) NOT NULL UNIQUE,
  fa_password VARCHAR(255) NOT NULL,
  fa_name VARCHAR(100) NOT NULL,
  fa_group_ids VARCHAR(255) NOT NULL DEFAULT '*',
  fa_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==================== 초기 테스트 데이터 적재 ====================

-- 1. 대그룹
INSERT INTO fair_group (fg_id, fg_name, fg_period, fg_status, fg_code) VALUES
(1, '2026 우리쌀·우리술 K-라이스페스타 품평회', '2026.09.01 – 09.03', '진행중', 'krice2026');

-- 2. 부문
INSERT INTO fair_buman (fb_id, fb_fg_id, fb_prefix, fb_group, fb_name, fb_type) VALUES
(1, 1, 'A', '쌀가공식품', '조리', 'open'),
(2, 1, 'B', '쌀가공식품', '비조리', 'open'),
(3, 1, '가', '우리술', '저도발효주', 'blind'),
(4, 1, '나', '우리술', '고도발효주', 'blind');

-- 3. 평가자 (심사위원)
INSERT INTO fair_judge (fj_id, fj_fg_id, fj_name, fj_affiliation, fj_role) VALUES
(1, 1, '김심사', '한국식품연구원', '심사위원장'),
(2, 1, '이평가', '농촌진흥청', '심사위원'),
(3, 1, '박관능', '전통주갤러리', '심사위원');

-- 3-1. 평가자-부문 초기 매핑 (기본적으로 전 부문 배정)
INSERT INTO fair_judge_buman (fjb_fb_id, fjb_fj_id) VALUES
(1, 1), (1, 2), (1, 3),
(2, 1), (2, 2), (2, 3),
(3, 1), (3, 2), (3, 3),
(4, 1), (4, 2), (4, 3);


-- 4. 제품
INSERT INTO fair_product (fp_id, fp_fb_id, fp_code, fp_name) VALUES
-- A조리 제품
(1, 1, 'A-1', '미라클누룽지'),
(2, 1, 'A-2', '황금누룽지'),
(3, 1, 'A-3', '우리쌀김밥'),
(4, 1, 'A-4', '매콤쌀떡볶기'),
-- B비조리 제품
(5, 2, 'B-1', '유기농쌀가루'),
(6, 2, 'B-2', '발아현미믹스'),
-- 가 저도발효주 제품 (블라인드는 제품명 미노출)
(7, 3, '가-1', ''),
(8, 3, '가-2', '');

-- 5. 평가 템플릿
INSERT INTO fair_evaluation_template (fet_id, fet_fg_id, fet_target_type, fet_target_id) VALUES
(1, 1, 'open_all', NULL),
(2, 1, 'blind_all', NULL);

-- 6. 평가 항목 (템플릿 기준)
-- 오픈 공통 템플릿 (fet_id = 1)
INSERT INTO fair_evaluation_item (fei_id, fei_fet_id, fei_group_name, fei_name, fei_max_score, fei_convert_to) VALUES
-- 관능평가 (최대 100점 -> 70점 환산)
(1, 1, '관능평가', '식품의 색', 15, 70),
(2, 1, '관능평가', '식품의 향', 15, 70),
(3, 1, '관능평가', '식품의 맛', 30, 70),
(4, 1, '관능평가', '식품의 식감', 20, 70),
(5, 1, '관능평가', '종합평가', 20, 70),
-- 상품성평가
(6, 1, '상품성평가', '창의성', 30, NULL),
(7, 1, '상품성평가', '디자인', 20, NULL);

-- 블라인드 공통 템플릿 (fet_id = 2)
INSERT INTO fair_evaluation_item (fei_id, fei_fet_id, fei_group_name, fei_name, fei_max_score, fei_convert_to) VALUES
-- 관능평가
(8, 2, '관능평가', '술의 색', 20, NULL),
(9, 2, '관능평가', '술의 향', 20, NULL),
(10, 2, '관능평가', '술의 맛', 30, NULL),
(11, 2, '관능평가', '후미 및 목넘김', 20, NULL),
(12, 2, '관능평가', '종합평가', 30, NULL);
