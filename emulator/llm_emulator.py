import random


LOREM_IPSUM_WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
    "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
    "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
    "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
    "deserunt", "mollit", "anim", "id", "est", "laborum", "vitae", "suscipit",
    "tellus", "mauris", "pharetra", "convallis", "posuere", "morbi", "leo",
    "urna", "molestie", "iaculis", "porttitor", "lacus", "luctus", "accumsan",
    "tortor", "risus", "viverra", "adipiscing", "volutpat", "blandit", "turpis",
    "cursus", "mattis", "pulvinar", "sapien", "pellentesque", "habitant", "morbi",
    "tristique", "senectus", "netus", "malesuada", "fames", "egestas", "integer",
]


def generate_lorem_ipsum(length: int = 100) -> str:
    words = []
    for _ in range(length):
        words.append(random.choice(LOREM_IPSUM_WORDS))

    text = " ".join(words)
    return text[0].upper() + text[1:] + "."