
#include "includes.h"


void fus_path_cleanup(fus_path_t *path){
    /* ain't gotta do nuthin */
}

int fus_path_init(fus_path_t *path){
    path->path[0] = '\0';
    path->path_size = FUS_PATH_MAX;
    return 0;
}

int fus_path_add(fus_path_t *path, const char *part, int part_len){
    int path_len = strlen(path->path);
    int new_path_len = path_len + part_len;
    int max_path_len = path->path_size - 1;
    if(new_path_len > max_path_len){
        ERR_INFO();
        fprintf(stderr,
            "Path obtained from joining \"%s\" + \"%.*s\" would "
            "have length %i, but maximum allowed length is %i.\n",
            path->path, part_len, part,
            new_path_len, max_path_len);
        return 2;
    }
    strncpy(path->path + path_len, part, part_len);
    path->path[new_path_len] = '\0';
    return 0;
}

int fus_path_add_separator(fus_path_t *path){
    char part[2] = {FUS_PATH_SEPARATOR, '0'};
    return fus_path_add(path, part, 1);
}

