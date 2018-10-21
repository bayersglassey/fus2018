
#include "../includes.h"

int parse(fus_t *fus, const char *buffer){
    return EXIT_SUCCESS;
}

int main(int n_args, char *args[]){
    if(n_args < 2){
        fprintf(stderr, "Usage: %s FILE\n", args[0]);
        fprintf(stderr, "Parses the file as fus data and prints formatted "
            "version to stdout.\n");
        return EXIT_FAILURE;
    }

    const char *filename = args[1];
    char *buffer = load_file(filename);

    fus_t fus;
    fus_init(&fus);

    int status = parse(&fus, buffer);

    fus_cleanup(&fus);
    free(buffer);
    return status;
}
