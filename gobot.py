from aiogram.client.default import DefaultBotProperties
import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message, CallbackQuery, WebAppInfo,
    InlineKeyboardMarkup, InlineKeyboardButton,
    ReplyKeyboardMarkup, KeyboardButton
)
from aiogram.filters import CommandStart, Command
from aiogram.utils.markdown import hbold
from dotenv import load_dotenv # type: ignore

from database import init_db, get_or_create_user, get_user_stats, update_balance

load_dotenv()

# Конфигурация из переменных окружения
BOT_TOKEN = os.getenv("BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-domain.com/duck_stars/")
WELCOME_BONUS = float(os.getenv("WELCOME_BONUS", "25.0"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
dp = Dispatcher()

def build_main_keyboard() -> ReplyKeyboardMarkup:
    """Создает главную клавиатуру с кнопкой запуска WebApp."""
    return ReplyKeyboardMarkup(
        keyboard=[[
            KeyboardButton(
                text="🦆 Играть в Duck Stars",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        ]],
        resize_keyboard=True,
        one_time_keyboard=False
    )

def build_inline_menu() -> InlineKeyboardMarkup:
    """Создает inline-меню с дополнительными опциями."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🎮 Открыть игру",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )],
        [
            InlineKeyboardButton(text="📊 Статистика", callback_data="stats"),
            InlineKeyboardButton(text="🏆 Рейтинг", callback_data="leaderboard")
        ],
        [InlineKeyboardButton(text="ℹ️ Помощь", callback_data="help")]
    ])

@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """
    Обработчик команды /start.
    Регистрирует нового пользователя или приветствует существующего.
    """
    user_id = message.from_user.id
    username = message.from_user.username or ""
    first_name = message.from_user.first_name or "Игрок"
    
    user_data, is_new = get_or_create_user(user_id, username, first_name, WELCOME_BONUS)
    
    if is_new:
        welcome_text = (
            f"🦆 {hbold('Добро пожаловать в Duck Stars!')}\n\n"
            f"Привет, {hbold(first_name)}! 👋\n\n"
            f"🎁 Тебе начислено {hbold(str(int(WELCOME_BONUS)))} звёзд!\n\n"
            f"🎰 Слоты 777 — совпади уточек и выиграй!\n"
            f"🪙 Монетка — угадай сторону (x1.9)\n"
            f"🚀 Краш — забери до падения!\n"
            f"🎡 Рулетка — выбери цвет и рискуй!\n\n"
            f"💡 {hbold('Первые 3 игры — повышенный шанс!')}"
        )
        logger.info(f"[NEW USER] {user_id} | @{username} | bonus={WELCOME_BONUS}⭐")
    else:
        balance = user_data['balance']
        games = user_data['games_played']
        wins = user_data['total_wins']
        win_rate = round((wins / games * 100), 1) if games > 0 else 0
        
        welcome_text = (
            f"🦆 {hbold('С возвращением в Duck Stars!')}\n\n"
            f"Рад видеть тебя снова, {hbold(first_name)}! 🎉\n\n"
            f"📊 {hbold('Твоя статистика:')}\n"
            f"⭐ Баланс: {hbold(f'{balance:.0f}')} звёзд\n"
            f"🎮 Игр: {hbold(str(games))}\n"
            f"🏆 Побед: {hbold(str(wins))} ({win_rate}%)"
        )
        logger.info(f"[RETURN USER] {user_id} | @{username} | balance={balance}⭐")
    
    await message.answer(welcome_text, reply_markup=build_main_keyboard())
    await message.answer(
        "👇 Выбери действие:",
        reply_markup=build_inline_menu()
    )

@dp.callback_query(F.data == "stats")
async def cb_stats(callback: CallbackQuery) -> None:
    """Показывает детальную статистику пользователя."""
    stats = get_user_stats(callback.from_user.id)
    if not stats:
        await callback.answer("Сначала запусти /start", show_alert=True)
        return
    
    user = stats['user']
    games_stats = stats['games_stats']
    
    text = [
        f"📊 {hbold('Статистика Duck Stars')}\n",
        f"⭐ Баланс: {hbold(f'{user["balance"]:.0f}')} звёзд",
        f"🎮 Всего игр: {hbold(str(user['games_played']))}",
        f"🏆 Побед: {hbold(str(user['total_wins']))}",
        f"💔 Поражений: {hbold(str(user['total_losses']))}"
    ]
    
    if games_stats:
        text.append(f"\n🎯 {hbold('По играм:')}")
        for stat in games_stats:
            game_names = {
                'slots': '🎰 Слоты',
                'crash': '🚀 Краш', 
                'roulette': '🎡 Рулетка',
                'coin': '🪙 Монетка'
            }
            name = game_names.get(stat['game_type'], stat['game_type'])
            text.append(f"{name}: {stat['count']} игр")
    
    await callback.message.answer("\n".join(text))
    await callback.answer()

@dp.callback_query(F.data == "help")
async def cb_help(callback: CallbackQuery) -> None:
    """Показывает справочную информацию."""
    help_text = (
        f"ℹ️ {hbold('Справка Duck Stars')}\n\n"
        f"🎰 {hbold('Слоты 777')} — совпади 3 символа (до x5.0)\n"
        f"🪙 {hbold('Монетка')} — угадай сторону (x1.9)\n"
        f"🚀 {hbold('Краш')} — забери до падения (до x100)\n"
        f"🎡 {hbold('Рулетка')} — красное/черное (x2), золото (x14)\n\n"
        f"💰 {hbold('Ставки:')} 3, 5, 10, 25, 50, 100, 500, 1000 ⭐\n"
        f"🎁 {hbold('Бонус:')} 25⭐ при регистрации\n"
        f"📈 {hbold('RTP:')} 40% (55% первые 3 игры)"
    )
    await callback.message.answer(help_text)
    await callback.answer()

async def main() -> None:
    """Точка входа — инициализация и запуск бота."""
    init_db()
    logger.info("🦆 Duck Stars Bot запущен!")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())

if __name__ == "__main__":
    asyncio.run(main())
