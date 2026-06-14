"""
Generate a JSON template for property metadata that can be served via Python HTTP.

This template defines the expected structure for scraped property data.
Usage: python scripts/generate_property_template.py
"""
import json
import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List


class Address(BaseModel):
    street: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    full_address: str = ""


class PropertyDetails(BaseModel):
    bedrooms: int = 0
    bathrooms: float = 0
    sqft: int = 0
    lot_size: str = ""
    year_built: int = 0
    property_type: str = ""
    style: str = ""
    stories: int = 0


class ListingDetails(BaseModel):
    mls_number: str = ""
    listing_type: str = ""
    status: str = ""
    listed_date: str = ""
    expiration_date: str = ""
    url: str = ""


class Features(BaseModel):
    interior: List[str] = Field(default_factory=list)
    exterior: List[str] = Field(default_factory=list)
    amenities: List[str] = Field(default_factory=list)
    appliances: List[str] = Field(default_factory=list)
    flooring: List[str] = Field(default_factory=list)
    heating: List[str] = Field(default_factory=list)
    cooling: List[str] = Field(default_factory=list)
    parking: List[str] = Field(default_factory=list)
    roof: List[str] = Field(default_factory=list)
    foundation: List[str] = Field(default_factory=list)


class Neighborhood(BaseModel):
    name: str = ""
    description: str = ""
    schools: List[str] = Field(default_factory=list)
    walk_score: int = 0
    transit_score: int = 0


class Financial(BaseModel):
    price_per_sqft: float = 0
    hoa_fee: float = 0
    hoa_fee_frequency: str = ""
    taxes_annual: float = 0
    utilities_included: List[str] = Field(default_factory=list)


class Media(BaseModel):
    photos: List[str] = Field(default_factory=list)
    virtual_tour_url: str = ""
    video_url: str = ""


class AgentInfo(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    company: str = ""


class MetaInfo(BaseModel):
    scraped_at: str = ""
    source_url: str = ""
    source_type: str = ""
    confidence_score: float = 0


class PropertyMetadata(BaseModel):
    """Pydantic model for property metadata - defines the structure for scraping."""
    price: str = ""
    address: Address = Field(default_factory=Address)
    property_details: PropertyDetails = Field(default_factory=PropertyDetails)
    listing_details: ListingDetails = Field(default_factory=ListingDetails)
    features: Features = Field(default_factory=Features)
    neighborhood: Neighborhood = Field(default_factory=Neighborhood)
    financial: Financial = Field(default_factory=Financial)
    media: Media = Field(default_factory=Media)
    agent_info: AgentInfo = Field(default_factory=AgentInfo)
    meta: MetaInfo = Field(default_factory=MetaInfo)


def generate_property_template() -> dict:
    """
    Generate a comprehensive JSON template for property metadata.
    
    Returns:
        dict: Property metadata template
    """
    # Create a PropertyMetadata instance with defaults
    metadata = PropertyMetadata()
    
    # Return as dict
    return metadata.model_dump()


def get_property_metadata_schema() -> dict:
    """
    Get the Pydantic schema for PropertyMetadata.
    
    Returns:
        dict: JSON schema for property metadata validation
    """
    return PropertyMetadata.model_json_schema()


def generate_sample_json() -> dict:
    """Generate a sample populated template for reference."""
    return {
        "price": "$500,000",
        "address": {
            "street": "123 Main St",
            "city": "San Francisco",
            "state": "CA",
            "zip_code": "94102",
            "full_address": "123 Main St, San Francisco, CA 94102"
        },
        "property_details": {
            "bedrooms": 3,
            "bathrooms": 2,
            "sqft": 1500,
            "lot_size": "5000 sqft",
            "year_built": 1995,
            "property_type": "Single Family",
            "style": "Colonial",
            "stories": 2
        },
        "listing_details": {
            "mls_number": "12345678",
            "listing_type": "For Sale",
            "status": "Active",
            "listed_date": "2024-01-15",
            "expiration_date": "2024-07-15",
            "url": "https://www.zillow.com/homedetails/123-Street-CA/12345_zpid/"
        },
        "features": {
            "interior": ["Hardwood Floors", "Fireplace", "Crown Molding", "Built-in Shelves"],
            "exterior": ["Deck", "Patio", "Garden", "Garage"],
            "amenities": ["Swimming Pool", "Gym", "Security System", "Smart Home"],
            "appliances": ["Refrigerator", "Oven", "Dishwasher", "Washer", "Dryer"],
            "flooring": ["Hardwood", "Carpet", "Tile"],
            "heating": ["Forced Air", "Gas"],
            "cooling": ["Central Air"],
            "parking": ["Attached Garage", "Driveway"],
            "roof": ["Composition Shingle"],
            "foundation": ["Concrete"]
        },
        "neighborhood": {
            "name": "Downtown District",
            "description": "Central location with easy access to shops, restaurants, and public transit.",
            "schools": ["Lincoln Elementary", "Washington Middle", "High School"],
            "walk_score": 85,
            "transit_score": 70
        },
        "financial": {
            "price_per_sqft": 333,
            "hoa_fee": 150,
            "hoa_fee_frequency": "monthly",
            "taxes_annual": 5000,
            "utilities_included": ["Water", "Trash"]
        },
        "media": {
            "photos": [
                "https://example.com/photo1.jpg",
                "https://example.com/photo2.jpg"
            ],
            "virtual_tour_url": "https://example.com/virtual-tour",
            "video_url": "https://example.com/video"
        },
        "agent_info": {
            "name": "John Doe",
            "phone": "(555) 123-4567",
            "email": "john@example.com",
            "company": "Realty Co."
        },
        "meta": {
            "scraped_at": "2024-01-20T10:30:00Z",
            "source_url": "https://www.zillow.com/homedetails/123-Street-CA/12345_zpid/",
            "source_type": "zillow",
            "confidence_score": 0.95
        }
    }


def save_template(output_dir: str = "property_templates", filename: str = "property_metadata.json"):
    """Save template to file."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    template_path = output_path / filename
    
    template = generate_property_template()
    
    with open(template_path, 'w') as f:
        json.dump(template, f, indent=2)
    
    print(f"[OK] Template saved to: {template_path}")
    
    # Also save sample
    sample_path = output_path / "sample_property_metadata.json"
    with open(sample_path, 'w') as f:
        json.dump(generate_sample_json(), f, indent=2)
    
    print(f"[OK] Sample saved to: {sample_path}")
    
    # Save Pydantic schema
    schema_path = output_path / "property_metadata_schema.json"
    with open(schema_path, 'w') as f:
        json.dump(get_property_metadata_schema(), f, indent=2)
    
    print(f"[OK] Schema saved to: {schema_path}")
    
    return template_path


def start_http_server(port: int = 8000, directory: str = "property_templates"):
    """Start a simple HTTP server to serve the template."""
    import http.server
    import socketserver
    
    os.chdir(directory)
    
    Handler = http.server.SimpleHTTPRequestHandler
    
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"\n{'='*60}")
        print(f"HTTP Server running at: http://localhost:{port}")
        print(f"Serving files from: {directory}/")
        print(f"{'='*60}\n")
        print(f"Available files:")
        print(f"  - http://localhost:{port}/property_metadata.json       (template)")
        print(f"  - http://localhost:{port}/sample_property_metadata.json  (sample)")
        print(f"  - http://localhost:{port}/property_metadata_schema.json  (Pydantic schema)")
        print(f"\nPress Ctrl+C to stop\n")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    import sys
    
    # Parse arguments
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]}. Using default: 8000")
    
    # Generate and save template
    template_path = save_template()
    
    # Start HTTP server
    start_http_server(port=port)
