#ifndef _FUS_PATHUTIL_H_
#define _FUS_PATHUTIL_H_


/* What the hell do I include to get PATH_MAX?
Whatever, heeere I go agaaaain on my oooowooown */
#define FUS_PATH_MAX 1024

#define FUS_PATH_SEPARATOR '/'


typedef struct fus_path {
    char path[FUS_PATH_MAX];
    size_t path_size;
} fus_path_t;

void fus_path_cleanup(fus_path_t *path);
int fus_path_init(fus_path_t *path);
int fus_path_add(fus_path_t *path, const char *part, int part_len);
int fus_path_add_separator(fus_path_t *path);


#endif