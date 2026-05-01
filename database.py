import sqlite3
import os
from datetime import datetime
from typing import Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'game.db')

def get_connection() -> sqlite3.Connection:
    """Создает соединение с базой данных с оптимизированными настройками."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # Улучшает производительность
    conn.execute("PRAGMA foreign_keys=ON")   # Включает внешние ключи
    return conn

def init_db() -> None:
    """Инициализирует базу данных с полной схемой для игрового процесса."""
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id        INTEGER PRIMARY KEY,
                username       TEXT,
                first_name     TEXT,
                balance        REAL    DEFAULT 0.0,
                total_wins     INTEGER DEFAULT 0,
                total_losses   INTEGER DEFAULT 0,
                games_played   INTEGER DEFAULT 0,
                is_new_player  INTEGER DEFAULT 1,
                new_player_games_left INTEGER DEFAULT 3,
                created_at     TEXT    DEFAULT (datetime('now')),
                last_seen      TEXT    DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                amount      REAL    NOT NULL,
                type        TEXT    NOT NULL CHECK (type IN ('bonus', 'bet', 'win', 'task')),
                description TEXT,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS game_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                game_type   TEXT    NOT NULL CHECK (game_type IN ('slots', 'crash', 'roulette', 'coin')),
                bet_amount  REAL    NOT NULL,
                win_amount  REAL    DEFAULT 0.0,
                result      TEXT    NOT NULL,
                multiplier  REAL    DEFAULT 1.0,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
            CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id);
        """)
    print("[DATABASE] ✅ Инициализация завершена успешно")

def get_or_create_user(user_id: int, username: str = "", first_name: str = "", welcome_bonus: float = 25.0) -> Tuple[dict, bool]:
    """
    Получает существующего пользователя или создает нового с приветственным бонусом.
    
    Returns:
        Tuple[dict, bool]: (user_data, is_new_user)
    """
    with get_connection() as conn:
        # Проверяем существующего пользователя
        user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        
        if user:
            # Обновляем время последнего входа
            conn.execute("UPDATE users SET last_seen = datetime('now') WHERE user_id = ?", (user_id,))
            return dict(user), False
        
        # Создаем нового пользователя
        now = datetime.now().isoformat()
        conn.execute("""
            INSERT INTO users (user_id, username, first_name, balance, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, username, first_name, welcome_bonus, now, now))
        
        # Записываем транзакцию приветственного бонуса
        conn.execute("""
            INSERT INTO transactions (user_id, amount, type, description)
            VALUES (?, ?, 'bonus', 'Приветственный бонус 🎁')
        """, (user_id, welcome_bonus))
        
        # Получаем созданного пользователя
        new_user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(new_user), True

def update_balance(user_id: int, delta: float, transaction_type: str = 'game', description: str = '') -> float:
    """
    Атомарно обновляет баланс пользователя с защитой от отрицательных значений.
    
    Returns:
        float: Новый баланс пользователя
    """
    with get_connection() as conn:
        # Атомарное обновление баланса
        conn.execute("""
            UPDATE users 
            SET balance = MAX(0, balance + ?), 
                last_seen = datetime('now')
            WHERE user_id = ?
        """, (delta, user_id))
        
        # Записываем транзакцию
        conn.execute("""
            INSERT INTO transactions (user_id, amount, type, description)
            VALUES (?, ?, ?, ?)
        """, (user_id, delta, transaction_type, description))
        
        # Возвращаем новый баланс
        result = conn.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return result['balance'] if result else 0.0

def record_game_result(user_id: int, game_type: str, bet_amount: float, win_amount: float, result: str, multiplier: float = 1.0) -> None:
    """
    Записывает результат игры и обновляет статистику пользователя.
    Также управляет системой повышенного RTP для новичков.
    """
    with get_connection() as conn:
        # Записываем игру в историю
        conn.execute("""
            INSERT INTO game_history (user_id, game_type, bet_amount, win_amount, result, multiplier)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, game_type, bet_amount, win_amount, result, multiplier))
        
        # Обновляем общую статистику
        if result == 'win':
            conn.execute("""
                UPDATE users 
                SET total_wins = total_wins + 1, 
                    games_played = games_played + 1
                WHERE user_id = ?
            """, (user_id,))
        else:
            conn.execute("""
                UPDATE users 
                SET total_losses = total_losses + 1, 
                    games_played = games_played + 1
                WHERE user_id = ?
            """, (user_id,))
        
        # Управляем системой новичков
        conn.execute("""
            UPDATE users 
            SET new_player_games_left = MAX(0, new_player_games_left - 1),
                is_new_player = CASE 
                    WHEN new_player_games_left <= 1 THEN 0 
                    ELSE is_new_player 
                END
            WHERE user_id = ?
        """, (user_id,))

def get_user_stats(user_id: int) -> Optional[dict]:
    """Получает полную статистику пользователя для отображения."""
    with get_connection() as conn:
        user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if not user:
            return None
            
        # Получаем статистику по играм
        games_stats = conn.execute("""
            SELECT game_type, COUNT(*) as count, SUM(win_amount) as total_wins
            FROM game_history 
            WHERE user_id = ? 
            GROUP BY game_type
        """, (user_id,)).fetchall()
        
        return {
            'user': dict(user),
            'games_stats': [dict(stat) for stat in games_stats]
        }
