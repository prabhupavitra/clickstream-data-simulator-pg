/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import {
  Box,
  Button,
  Header,
  Modal,
  SpaceBetween,
} from '@cloudscape-design/components';
import { deleteProject } from 'apis/project';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import CreateProject from '../create/CreateProject';

interface ProjectsHeaderProps {
  totalProject: number;
  project?: IProject;
  refreshPage: () => void;
  setSelectItemEmpty: () => void;
}

const ProjectsHeader: React.FC<ProjectsHeaderProps> = (
  props: ProjectsHeaderProps
) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { totalProject, project, refreshPage, setSelectItemEmpty } = props;
  const [openCreate, setOpenCreate] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const confirmDeleteProject = async () => {
    setLoadingDelete(true);
    try {
      const resData: ApiResponse<null> = await deleteProject({
        id: project?.id || '',
      });
      if (resData.success) {
        refreshPage();
        setLoadingDelete(false);
        setShowDeleteModal(false);
        setSelectItemEmpty();
      }
    } catch (error) {
      setLoadingDelete(false);
    }
  };

  return (
    <>
      <Modal
        onDismiss={() => setShowDeleteModal(false)}
        visible={showDeleteModal}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                onClick={() => {
                  setShowDeleteModal(false);
                }}
                variant="link"
              >
                {t('button.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  confirmDeleteProject();
                }}
                loading={loadingDelete}
              >
                {t('button.confirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
        header={t('project:delete.title')}
      >
        {t('project:delete.tip1')} <b>{project?.name}</b>,
        {t('project:delete.tip2')}
      </Modal>
      <CreateProject
        openModel={openCreate}
        closeModel={() => {
          setOpenCreate(false);
        }}
      />
      <Header
        variant="h1"
        counter={`(${totalProject})`}
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button
              disabled={!project?.id}
              onClick={() => {
                setShowDeleteModal(true);
              }}
            >
              {t('button.delete')}
            </Button>
            <Button
              disabled={!project?.id}
              onClick={() => {
                navigate(`/project/detail/${project?.id}`);
              }}
            >
              {t('button.viewDetails')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setOpenCreate(true);
              }}
            >
              {t('button.create')}
            </Button>
          </SpaceBetween>
        }
        description={t('project:description')}
      >
        {t('project:projects')}
      </Header>
    </>
  );
};

export default ProjectsHeader;
