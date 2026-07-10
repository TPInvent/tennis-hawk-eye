import json
import os
import sys
import cv2
import numpy as np

# Add TennisAnalytics path to import Helpers
sys.path.insert(0, r"c:\Users\topfeiff\TennisAnalytics\07_GUI")
from Helpers.Homography import get_homography_for_keypoints, calculate_transformed_position

annotations_path = r"c:\Users\topfeiff\TennisAnalytics\00_Dataset\annotations.json"
assets_dir = r"c:\Users\topfeiff\OneDrive - Capgemini\Desktop\tennis-hawk-eye\assests"
output_dir = r"c:\Users\topfeiff\OneDrive - Capgemini\Desktop\tennis-hawk-eye\backend\quiz_assets"

os.makedirs(output_dir, exist_ok=True)

with open(annotations_path, "r") as f:
    data = json.load(f)

amateur = [s for s in data["subsets"] if s["name"] == "Amateur"][0]

mp_keys = [
    'top_left_corner', 'top_left_singles', 'top_right_singles', 'top_right_corner',
    'bottom_left_corner', 'bottom_left_singles', 'bottom_right_singles', 'bottom_right_corner',
    'service_top_left', 'service_top_right', 'service_bottom_left', 'service_bottom_right',
    'service_center_top', 'service_center_bottom'
]

BUFFER_FRAMES = 5
clips_metadata = []

def slice_video(source_path, target_path, start_frame, num_frames, fps, width, height):
    cap = cv2.VideoCapture(source_path)
    if not cap.isOpened():
        raise IOError(f"Cannot open video source: {source_path}")
        
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(target_path, fourcc, fps, (width, height))
    
    for _ in range(num_frames):
        ret, frame = cap.read()
        if not ret:
            break
        writer.write(frame)
        
    cap.release()
    writer.release()

for video in amateur["videos"]:
    video_name = video["name"]
    print(f"\n=== Processing Video: {video_name} ===")
    
    raw_video_path = os.path.join(assets_dir, "raw", f"{video_name}.mp4")
    inf_video_path = os.path.join(assets_dir, "inferenced", f"{video_name}.mp4")
    
    if not os.path.exists(raw_video_path) or not os.path.exists(inf_video_path):
        print(f"Skipping {video_name} because raw/inferenced video files are missing.")
        continue
        
    # Open videos to read properties
    cap_raw = cv2.VideoCapture(raw_video_path)
    fps = cap_raw.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap_raw.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap_raw.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap_raw.release()
    
    global_frame_offset = 0
    
    for clip in video["clips"]:
        clip_name = clip["name"]
        frames = clip["frames_with_objects"]
        clip_len = len(frames)
        
        sorted_frame_indices = sorted(frames.keys(), key=lambda x: int(x))
        
        # Calculate court keypoints Homography
        court_positions = None
        for idx in sorted_frame_indices:
            frame_data = frames[idx]
            if "keypoints" in frame_data and len(frame_data["keypoints"]) > 0:
                kp_dict = frame_data["keypoints"][0]["points"]
                court_positions = []
                for k in mp_keys:
                    if k in kp_dict:
                        court_positions.append(kp_dict[k])
                    else:
                        court_positions.append([np.nan, np.nan])
                break
                
        if court_positions is None:
            print(f"  {clip_name}: No court keypoints, skipping.")
            global_frame_offset += clip_len
            continue
            
        homography_matrix = get_homography_for_keypoints(court_positions)
        
        # Find bounce frames
        bounce_indices = []
        for i, frame_idx in enumerate(sorted_frame_indices):
            frame_data = frames[frame_idx]
            for ball in frame_data.get("balls", []):
                if ball.get("trajectory") == "Bounce":
                    bounce_indices.append((i, frame_idx, ball))
                    break
                    
        if not bounce_indices:
            print(f"  {clip_name}: No bounce found, skipping.")
            global_frame_offset += clip_len
            continue
            
        # Get the last bounce relative index in the clip
        last_rel_idx, last_frame_idx, last_ball = bounce_indices[-1]
        ball_pos = [last_ball["x"], last_ball["y"]]
        transformed = calculate_transformed_position(homography_matrix, [ball_pos])[0]
        x, y = transformed
        
        verdict = "in" if (484 <= x <= 1312 and 602 <= y <= 2974) else "out"
        
        clip_slug = f"{video_name.lower()}_{clip_name.lower()}"
        clip_out_dir = os.path.join(output_dir, clip_slug)
        os.makedirs(clip_out_dir, exist_ok=True)
        
        question_path = os.path.join(clip_out_dir, "question.mp4")
        reveal_path = os.path.join(clip_out_dir, "reveal.mp4")
        
        # Slicing frame range
        # Question: starts at global_frame_offset, runs for (last_rel_idx - BUFFER_FRAMES) frames
        q_num_frames = max(1, last_rel_idx - BUFFER_FRAMES)
        
        # Reveal: starts at global_frame_offset, runs for clip_len frames
        r_num_frames = clip_len
        
        print(f"  Slicing {clip_slug}: bounce at rel_frame={last_rel_idx} (verdict={verdict}).")
        print(f"    -> Question starts {global_frame_offset}, len {q_num_frames}")
        print(f"    -> Reveal starts {global_frame_offset}, len {r_num_frames}")
        
        try:
            slice_video(raw_video_path, question_path, global_frame_offset, q_num_frames, fps, width, height)
            slice_video(inf_video_path, reveal_path, global_frame_offset, r_num_frames, fps, width, height)
            
            clips_metadata.append({
                "id": clip_slug,
                "video_id": video_name,
                "clip_id": clip_name,
                "verdict": verdict,
                "bounce_relative_frame": last_rel_idx,
                "model_court_x": int(x),
                "model_court_y": int(y)
            })
        except Exception as e:
            print(f"  Failed to slice {clip_slug}: {e}")
            
        global_frame_offset += clip_len

# Write clips.json
metadata_out = {"clips": clips_metadata}
with open(os.path.join(output_dir, "clips.json"), "w") as f:
    json.dump(metadata_out, f, indent=2)

print("\n=== Finished Slicing Clips! ===")
print(f"Generated {len(clips_metadata)} clips under {output_dir}")
