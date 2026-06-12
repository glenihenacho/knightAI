//! Minimal multi-object tracker. At ~1 fps a Kalman filter buys little; what
//! matters is stable ids while a person stands or walks through a zone, so:
//! greedy IoU matching with a centroid-distance fallback (a brisk walker can
//! move far enough between 1 fps frames that boxes no longer overlap).

use crate::geometry::BBox;

#[derive(Debug, Clone, Copy)]
pub struct Detection {
    pub bbox: BBox,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Track {
    pub id: u64,
    pub bbox: BBox,
    pub confidence: f32,
    pub last_seen: f64,
}

pub struct Tracker {
    tracks: Vec<Track>,
    next_id: u64,
    /// Seconds a track survives without a matching detection. Bridges short
    /// occlusions / missed detections without splitting the track id.
    max_age: f64,
    iou_threshold: f32,
    /// Normalized centroid distance accepted when IoU fails.
    centroid_threshold: f32,
}

impl Default for Tracker {
    fn default() -> Self {
        Self {
            tracks: Vec::new(),
            next_id: 1,
            max_age: 3.0,
            iou_threshold: 0.25,
            centroid_threshold: 0.12,
        }
    }
}

impl Tracker {
    /// Feed one frame's detections at time `t` (seconds, monotonic-ish);
    /// returns the live tracks that matched or were created this frame.
    pub fn update(&mut self, detections: &[Detection], t: f64) -> Vec<Track> {
        // Expire stale tracks BEFORE matching — a track that aged out must
        // not be resurrected by a new person appearing at the same spot.
        let max_age = self.max_age;
        self.tracks.retain(|tr| t - tr.last_seen <= max_age);

        // Score every (track, detection) pair, best matches first.
        let mut pairs: Vec<(usize, usize, f32)> = Vec::new();
        for (ti, track) in self.tracks.iter().enumerate() {
            for (di, det) in detections.iter().enumerate() {
                let iou = track.bbox.iou(&det.bbox);
                if iou >= self.iou_threshold {
                    // IoU matches outrank any centroid match.
                    pairs.push((ti, di, 1.0 + iou));
                    continue;
                }
                let tc = track.bbox.center();
                let dc = det.bbox.center();
                let dist = ((tc.x - dc.x).powi(2) + (tc.y - dc.y).powi(2)).sqrt();
                if dist <= self.centroid_threshold {
                    pairs.push((ti, di, 1.0 - dist));
                }
            }
        }
        pairs.sort_by(|a, b| b.2.total_cmp(&a.2));

        let mut track_used = vec![false; self.tracks.len()];
        let mut det_used = vec![false; detections.len()];
        let mut current: Vec<Track> = Vec::new();

        for (ti, di, _) in pairs {
            if track_used[ti] || det_used[di] {
                continue;
            }
            track_used[ti] = true;
            det_used[di] = true;
            let track = &mut self.tracks[ti];
            track.bbox = detections[di].bbox;
            track.confidence = detections[di].confidence;
            track.last_seen = t;
            current.push(*track);
        }

        for (di, det) in detections.iter().enumerate() {
            if det_used[di] {
                continue;
            }
            let track = Track {
                id: self.next_id,
                bbox: det.bbox,
                confidence: det.confidence,
                last_seen: t,
            };
            self.next_id += 1;
            self.tracks.push(track);
            current.push(track);
        }

        current
    }

    /// Ids still alive in the tracker — includes tracks that missed the
    /// current frame but haven't aged out. The engine GCs its per-track
    /// state against this, not against the frame's matches, so a single
    /// missed detection doesn't reset dwell timers or presence cooldowns.
    pub fn alive_ids(&self) -> impl Iterator<Item = u64> + '_ {
        self.tracks.iter().map(|tr| tr.id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn det(x1: f32, y1: f32, x2: f32, y2: f32) -> Detection {
        Detection { bbox: BBox { x1, y1, x2, y2 }, confidence: 0.9 }
    }

    #[test]
    fn keeps_id_across_overlapping_frames() {
        let mut tr = Tracker::default();
        let a = tr.update(&[det(0.40, 0.40, 0.50, 0.60)], 0.0);
        let b = tr.update(&[det(0.42, 0.40, 0.52, 0.60)], 1.0);
        assert_eq!(a[0].id, b[0].id);
    }

    #[test]
    fn centroid_fallback_bridges_fast_movement() {
        let mut tr = Tracker::default();
        let a = tr.update(&[det(0.40, 0.40, 0.46, 0.55)], 0.0);
        // Walked far enough that the boxes no longer overlap, but the
        // centroid only moved ~0.08.
        let b = tr.update(&[det(0.48, 0.40, 0.54, 0.55)], 1.0);
        assert_eq!(a[0].id, b[0].id);
    }

    #[test]
    fn distinct_people_get_distinct_ids() {
        let mut tr = Tracker::default();
        let tracks = tr.update(&[det(0.1, 0.1, 0.2, 0.3), det(0.7, 0.6, 0.8, 0.9)], 0.0);
        assert_ne!(tracks[0].id, tracks[1].id);
    }

    #[test]
    fn stale_tracks_expire_and_ids_are_not_reused() {
        let mut tr = Tracker::default();
        let a = tr.update(&[det(0.40, 0.40, 0.50, 0.60)], 0.0);
        let _gap = tr.update(&[], 1.0);
        // 5s later (> max_age) the same spot is a NEW person/track.
        let b = tr.update(&[det(0.40, 0.40, 0.50, 0.60)], 5.0);
        assert_ne!(a[0].id, b[0].id);
    }

    #[test]
    fn survives_single_missed_frame() {
        let mut tr = Tracker::default();
        let a = tr.update(&[det(0.40, 0.40, 0.50, 0.60)], 0.0);
        let _gap = tr.update(&[], 1.0);
        let b = tr.update(&[det(0.41, 0.40, 0.51, 0.60)], 2.0);
        assert_eq!(a[0].id, b[0].id);
    }
}
