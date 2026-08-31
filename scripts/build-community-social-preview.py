from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "community-social-preview-v2.png"
WIDTH, HEIGHT = 1200, 630

CREAM = "#F5F3EC"
BORDER = "#D4D7CC"
GREEN = "#1D4034"
ICON_GREEN = "#326652"
MUTED = "#8A9690"
BODY = "#42544F"
GOLD = "#F4C55E"
WHITE = "#F7FAF7"


def font(path, size):
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / path), size=size)


def centered(draw, y, text, typeface, fill, spacing=4):
    box = draw.multiline_textbbox((0, 0), text, font=typeface, spacing=spacing, align="center")
    x = (WIDTH - (box[2] - box[0])) / 2
    draw.multiline_text((x, y), text, font=typeface, fill=fill, spacing=spacing, align="center")


image = Image.new("RGB", (WIDTH, HEIGHT), CREAM)
draw = ImageDraw.Draw(image)

draw.rounded_rectangle((30, 30, 1170, 600), radius=27, outline=BORDER, width=1)

# The broader assistant is represented by a conversation bubble rather than
# the former rule-document icon.
draw.rounded_rectangle((526, 76, 674, 224), radius=34, fill=ICON_GREEN)
draw.rounded_rectangle((560, 111, 640, 174), radius=14, fill=WHITE)
draw.polygon([(572, 170), (561, 191), (588, 174)], fill=WHITE)
for y, length in [(128, 48), (145, 41), (162, 30)]:
    draw.rounded_rectangle((576, y, 576 + length, y + 6), radius=3, fill=ICON_GREEN)
draw.line((622, 181, 633, 192), fill=GOLD, width=9)
draw.line((633, 192, 653, 166), fill=GOLD, width=9)

brand_font = font("segoeuib.ttf", 23)
title_font = font("georgiab.ttf", 75)
body_font = font("segoeui.ttf", 33)
url_font = font("segoeui.ttf", 22)

centered(draw, 276, "S T E R L I N G   R A N C H   S O C I E T Y", brand_font, MUTED)
centered(draw, 326, "Community Assistant", title_font, GREEN)
centered(
    draw,
    438,
    "Helpful answers about Sterling Ranch rules, services,\nforms, facilities, events, and more.",
    body_font,
    BODY,
    spacing=8,
)
centered(draw, 558, "sterlingranchsociety.com/community-assistant", url_font, MUTED)

image.save(OUTPUT, format="PNG", optimize=True)
print(OUTPUT)
