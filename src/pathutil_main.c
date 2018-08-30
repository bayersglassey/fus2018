
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "pathutil.h"


/* Where the hell is PATH_MAX? */
#define MAX_PATH_SIZE 256


static void usage(){
    printf(
        "Usage: test <start path> <name to find>\n"
    );
}


int pathutil_main(int n_args, char *args[]){
    int err;
    if(n_args != 3){
        usage();
        return 2;
    }
    char *start_path = args[1];
    char *name = args[2];
    size_t name_len = strlen(name);
    char path[MAX_PATH_SIZE];

    printf("Searching for \"%s\" in \"%s\"...\n", name, start_path);

    err = find_file_parent(start_path, name, name_len, path, MAX_PATH_SIZE);
    if(err)return err;

    printf("Found in: \"%s\"\n", path);
    return 0;
}
