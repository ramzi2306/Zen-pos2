import re

files_to_update = [
    '/Users/1/Desktop/ZEN-POS/zen-pos-api/app/models/product.py',
    '/Users/1/Desktop/ZEN-POS/zen-pos-api/app/schemas/product.py',
    '/Users/1/Desktop/ZEN-POS/zen-pos-api/app/routers/products.py'
]

# Provide replacements manually
def apply_replacements(filename):
    with open(filename, 'r') as f:
        content = f.read()

    if 'models/product.py' in filename:
        content = re.sub(
            r'class VariationOption\(BaseModel\):\n    id: str\n    name: str\n    price_adjustment: Optional\[float\] = None',
            r'''class SupplementOption(BaseModel):
    id: str
    name: str
    price_adjustment: Optional[float] = None
    ingredients: list[Ingredient] = Field(default_factory=list)

class SupplementGroup(BaseModel):
    id: str
    name: str
    options: list[SupplementOption] = Field(default_factory=list)

class VariationOption(BaseModel):
    id: str
    name: str
    price: Optional[float] = None''',
            content
        )
        content = re.sub(
            r'variations: list\[VariationGroup\] = Field\(default_factory=list\)',
            r'variations: list[VariationGroup] = Field(default_factory=list)\n    supplements: list[SupplementGroup] = Field(default_factory=list)',
            content
        )

    if 'schemas/product.py' in filename:
        content = re.sub(
            r'class VariationOptionSchema\(BaseModel\):\n    id: str\n    name: str\n    price_adjustment: Optional\[float\] = None',
            r'''class SupplementOptionSchema(BaseModel):
    id: str
    name: str
    price_adjustment: Optional[float] = None
    ingredients: list[IngredientSchema] = []

class SupplementGroupSchema(BaseModel):
    id: str
    name: str
    options: list[SupplementOptionSchema] = []

class VariationOptionSchema(BaseModel):
    id: str
    name: str
    price: Optional[float] = None''',
            content
        )
        content = re.sub(
            r'variations: list\[VariationGroupSchema\]\n',
            r'variations: list[VariationGroupSchema]\n    supplements: list[SupplementGroupSchema]\n',
            content
        )
        content = re.sub(
            r'variations: list\[VariationGroupSchema\] = \[\]\n',
            r'variations: list[VariationGroupSchema] = []\n    supplements: list[SupplementGroupSchema] = []\n',
            content
        )
        content = re.sub(
            r'variations: Optional\[list\[VariationGroupSchema\]\] = None\n',
            r'variations: Optional[list[VariationGroupSchema]] = None\n    supplements: Optional[list[SupplementGroupSchema]] = None\n',
            content
        )

    if 'routers/products.py' in filename:
        # Check if we need to map supplements manually, but since it's passing dicts/models directly, 
        # it might just work if we copy fields.
        pass

    with open(filename, 'w') as f:
        f.write(content)

for f in files_to_update:
    apply_replacements(f)
print("Backend updated.")
