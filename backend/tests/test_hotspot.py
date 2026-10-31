import pytest
from app.services.hotspot_detection import HotspotDetector
from app.data.synthetic import generate_synthetic_records

@pytest.fixture
def sample_data():
    """Generate sample synthetic data"""
    return generate_synthetic_records(num_records=100)

def test_hotspot_detector_initialization():
    """Test hotspot detector can be initialized"""
    detector = HotspotDetector()
    assert detector is not None

def test_synthetic_data_generation():
    """Test synthetic data generation"""
    data = generate_synthetic_records(num_records=50)
    
    assert "records" in data
    assert len(data["records"]) == 50
    assert "metadata" in data
    assert data["metadata"]["is_synthetic"] == True
    
    # Verify all records have required fields
    for record in data["records"]:
        assert "latitude" in record
        assert "longitude" in record
        assert "timestamp" in record
        assert record["is_synthetic"] == True