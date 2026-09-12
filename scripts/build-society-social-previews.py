from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
WIDTH, HEIGHT = 1200, 630

PAPER = "#F7F5EF"
NAVY = "#24364F"
TEAL = "#4F7D7B"
ROSE = "#A96F7D"
MUTED = "#65717D"
RULE = "#AEB6C1"

CARDS = {
    "society-social-preview-v3.png": (
        "The Daily Briefing",
        "What’s happening around Sterling Ranch, all in one place.",
        TEAL,
        "sterlingranchsociety.com",
    ),
    "community-social-preview-v3.png": (
        "Community Assistant",
        "Clear answers, useful next steps, and the official sources behind them.",
        TEAL,
        "sterlingranchsociety.com/community-assistant",
    ),
    "food-truck-social-preview-v3.png": (
        "Today’s Food Truck",
        "Today’s truck, menu highlights, and official links.",
        ROSE,
        "sterlingranchsociety.com/food-truck",
    ),
    "calendar-social-preview-v3.png": (
        "Community Calendar",
        "Upcoming Sterling Ranch events at a glance.",
        ROSE,
        "sterlingranchsociety.com/calendar",
    ),
    "openings-social-preview-v3.png": (
        "New Around Here",
        "Confirmed openings and local updates across Douglas County.",
        ROSE,
        "sterlingranchsociety.com/openings",
    ),
    "pool-social-preview-v3.png": (
        "Pool Status",
        "The latest official status for the Overlook pool.",
        TEAL,
        "sterlingranchsociety.com/pool",
    ),
}


def font(name, size):
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size=size)


def wrap(draw, text, typeface, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=typeface)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


mountains = Image.open(PUBLIC / "society-mountains-v2.webp").convert("L")
mountains = mountains.resize((WIDTH, 400), Image.Resampling.LANCZOS)
mountains = ImageOps.colorize(mountains, black=NAVY, white=PAPER).convert("RGBA")
fade = Image.new("L", mountains.size)
fade_pixels = fade.load()
for y in range(mountains.height):
    alpha = max(0, min(210, int((y - 20) * 0.72)))
    for x in range(mountains.width):
        fade_pixels[x, y] = alpha
mountains.putalpha(fade)

brand_font = font("segoeuib.ttf", 22)
title_font = font("georgiab.ttf", 76)
deck_font = font("georgia.ttf", 30)
url_font = font("segoeui.ttf", 20)
mark_font = font("georgiab.ttf", 29)

for filename, (title, deck, accent, url) in CARDS.items():
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    image.paste(mountains, (0, 230), mountains)
    draw = ImageDraw.Draw(image)

    draw.line((66, 58, 66, 154), fill=accent, width=6)
    draw.text((90, 56), "S", font=mark_font, fill=NAVY)
    draw.text((107, 74), "R", font=mark_font, fill=NAVY)
    draw.text((90, 94), "S", font=mark_font, fill=NAVY)
    draw.text((151, 69), "STERLING RANCH SOCIETY", font=brand_font, fill=NAVY)
    draw.text((151, 104), "DOUGLAS COUNTY, COLORADO", font=url_font, fill=MUTED)
    draw.line((66, 151, 1134, 151), fill=RULE, width=2)

    wrapped_title = wrap(draw, title, title_font, 1040)
    draw.multiline_text((66, 180), wrapped_title, font=title_font, fill=NAVY, spacing=4)
    title_box = draw.multiline_textbbox((66, 180), wrapped_title, font=title_font, spacing=4)
    deck_y = title_box[3] + 18
    wrapped_deck = wrap(draw, deck, deck_font, 960)
    draw.multiline_text((69, deck_y), wrapped_deck, font=deck_font, fill=MUTED, spacing=8)

    url_box = draw.textbbox((0, 0), url, font=url_font)
    draw.rounded_rectangle((65, 564, 87 + url_box[2], 608), radius=4, fill=PAPER, outline=RULE, width=1)
    draw.text((77, 574), url, font=url_font, fill=NAVY)

    image.save(PUBLIC / filename, format="PNG", optimize=True)
    print(PUBLIC / filename)
