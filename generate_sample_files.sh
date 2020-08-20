SAMPLE_FILE_DIR="sample_files"
rm -rf $SAMPLE_FILE_DIR
mkdir $SAMPLE_FILE_DIR
mkfile 1G $SAMPLE_FILE_DIR/sample_1G.txt
mkfile 1M $SAMPLE_FILE_DIR/sample_1M.txt
mkfile 100M $SAMPLE_FILE_DIR/sample_100M.txt

