
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#include "util.h"


#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <limits.h>


#define MAX_SEARCHES 10


int find_file(char *name, int name_len, bool *found_ptr){
    int err = 0;
    DIR *dir = opendir(".");
    if(dir == NULL){
        ERR_INFO();
        fprintf(stderr, "Couldn't open current directory.\n");
        perror(NULL);
        err = 2; goto err;
    }

    struct dirent *ent;
    while((ent = readdir(dir))){
        int ent_name_len = strlen(ent->d_name);
        if(ent_name_len == name_len && !strncmp(ent->d_name, name, name_len)){
            *found_ptr = true;
            goto err;
        }
    }

    *found_ptr = false;

err:
    if(dir != NULL && closedir(dir)){
        ERR_INFO();
        fprintf(stderr, "Couldn't close current directory.\n");
        perror(NULL);
        err = 2;
    }
    return err;
}


int find_file_parent(char *start_path, char *name, int name_len,
    char *path, size_t path_size
){
    int err;

    if(chdir(start_path)){
        ERR_INFO();
        fprintf(stderr, "Couldn't change to start directory: %s\n",
            start_path);
        perror(NULL);
        return 2;
    }

    int n_searches = 0;
    while(1){
        bool found = false;
        err = find_file(name, name_len, &found);
        if(err)return err;
        if(found){
            if(!getcwd(path, path_size)){
                ERR_INFO();
                fprintf(stderr, "Couldn't get cwd\n");
                perror(NULL);
                return 2;
            }
            return 0;
        }

        if(n_searches >= MAX_SEARCHES){
            ERR_INFO();
            fprintf(stderr,
                "Not found, max number of chdirs to \"..\" was %i\n",
                MAX_SEARCHES);
            return 2;
        }

        if(chdir("..")){
            ERR_INFO();
            fprintf(stderr, "Couldn't change to parent directory\n");
            perror(NULL);
            return 2;
        }

        n_searches++;
    }

    strncpy(path, "", path_size);
    return 0;
}


