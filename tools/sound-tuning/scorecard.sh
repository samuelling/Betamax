KI=attack_ms,decay_ms_10,decay_ms_20,decay_ms_30,w0_centroid_hz,w1_centroid_hz,w2_centroid_hz,low_frac,peak_to_tail_db,w0_band_63_db,w0_band_125_db,w0_band_250_db,w0_band_500_db,w0_band_1k_db,w0_band_2k_db,w0_band_4k_db,w1_band_125_db,w1_band_500_db,w1_band_1k_db,w1_band_4k_db
KC=ltas_50_db,ltas_80_db,ltas_125_db,ltas_200_db,ltas_315_db,ltas_500_db,ltas_800_db,ltas_1.25k_db,ltas_2k_db,ltas_3.15k_db,ltas_5k_db,centroid_hz,am_lt300_peak1_hz,tone1_hz
s() { echo -n "$1: "; shift; python3 compare.py "$@" | tail -1; }
s "rifle near vs real (34)" rifle curated_all impulse t/rifle[01]_?__near.wav --keys $KI
s "rifle far vs distant (7)" rifle tag_distant impulse t/rifle[01]_?__far.wav --keys $KI
s "mg near vs close bursts (13)" mg tag_close burst t/mg_*__near.wav --keys $KI,cyclic_rate_rpm
s "shell near vs detonations (13)" explosion subtype_detonation impulse t/eShell_?__near.wav --keys $KI
s "mortar near vs detonations (13)" explosion subtype_detonation impulse t/eMortar_?__near.wav --keys $KI
s "shell far vs distant (5)" explosion tag_distant impulse t/eShell_?__far.wav t/eMortar_?__far.wav --keys $KI
s "uh60 vs helicopters (28)" helicopter curated_all continuous t/uh60.wav --keys $KC
s "tank vs moving tanks (16)" tank tag_moving continuous t/tankmix.wav --keys $KC
s "scream vs screams (18)" scream tag_scream continuous t/vscream_*.wav --f0 --keys $KC,f0_median_hz,f0_p25_hz,f0_p75_hz
