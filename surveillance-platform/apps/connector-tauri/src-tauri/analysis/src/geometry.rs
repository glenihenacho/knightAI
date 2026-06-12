//! Zone membership tests on normalized coordinates.

use crate::config::Point;

/// Axis-aligned box, normalized to the frame ([0,1] on both axes).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BBox {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

impl BBox {
    /// Where the person touches the ground: bottom-center of the box. Using
    /// the feet rather than the box center keeps "in the zone" aligned with
    /// floor-drawn polygons even when the person's torso overhangs the edge.
    pub fn anchor(&self) -> Point {
        Point { x: (self.x1 + self.x2) / 2.0, y: self.y2 }
    }

    pub fn area(&self) -> f32 {
        (self.x2 - self.x1).max(0.0) * (self.y2 - self.y1).max(0.0)
    }

    pub fn iou(&self, other: &BBox) -> f32 {
        let ix1 = self.x1.max(other.x1);
        let iy1 = self.y1.max(other.y1);
        let ix2 = self.x2.min(other.x2);
        let iy2 = self.y2.min(other.y2);
        let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
        let union = self.area() + other.area() - inter;
        if union <= 0.0 { 0.0 } else { inter / union }
    }

    pub fn center(&self) -> Point {
        Point { x: (self.x1 + self.x2) / 2.0, y: (self.y1 + self.y2) / 2.0 }
    }
}

/// Ray-casting point-in-polygon. Polygons come from the dashboard's zone
/// editor: simple (non-self-intersecting), at least 3 vertices, either
/// winding order.
pub fn point_in_polygon(p: Point, polygon: &[Point]) -> bool {
    let n = polygon.len();
    if n < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let (a, b) = (polygon[i], polygon[j]);
        if ((a.y > p.y) != (b.y > p.y))
            && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
        {
            inside = !inside;
        }
        j = i;
    }
    inside
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Vec<Point> {
        vec![
            Point { x: 0.2, y: 0.2 },
            Point { x: 0.8, y: 0.2 },
            Point { x: 0.8, y: 0.8 },
            Point { x: 0.2, y: 0.8 },
        ]
    }

    #[test]
    fn inside_and_outside_square() {
        assert!(point_in_polygon(Point { x: 0.5, y: 0.5 }, &square()));
        assert!(!point_in_polygon(Point { x: 0.1, y: 0.5 }, &square()));
        assert!(!point_in_polygon(Point { x: 0.5, y: 0.9 }, &square()));
    }

    #[test]
    fn concave_polygon() {
        // L-shape: the notch (top-right quadrant) is outside.
        let l = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.5, y: 0.0 },
            Point { x: 0.5, y: 0.5 },
            Point { x: 1.0, y: 0.5 },
            Point { x: 1.0, y: 1.0 },
            Point { x: 0.0, y: 1.0 },
        ];
        assert!(point_in_polygon(Point { x: 0.25, y: 0.25 }, &l));
        assert!(!point_in_polygon(Point { x: 0.75, y: 0.25 }, &l));
        assert!(point_in_polygon(Point { x: 0.75, y: 0.75 }, &l));
    }

    #[test]
    fn iou_and_anchor() {
        let a = BBox { x1: 0.0, y1: 0.0, x2: 0.5, y2: 0.5 };
        let b = BBox { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
        let iou = a.iou(&b);
        assert!((iou - (0.0625 / 0.4375)).abs() < 1e-6);
        let anchor = a.anchor();
        assert!((anchor.x - 0.25).abs() < 1e-6 && (anchor.y - 0.5).abs() < 1e-6);
    }
}
